const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const path = require('path');
const fs = require('fs');
const net = require('net');

function isPortInUse(port, host = '127.0.0.1', timeoutMs = 800) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let status = false;

    socket.setTimeout(timeoutMs);

    socket.once('connect', () => {
      status = true;
      socket.destroy();
    });

    socket.once('timeout', () => {
      socket.destroy();
    });

    socket.once('error', () => {
      socket.destroy();
    });

    socket.once('close', () => {
      resolve(status);
    });

    socket.connect(port, host);
  });
}

async function startServer() {
  const PORT = 5432;
  const HOST = '127.0.0.1';

  // 1. Check if PostgreSQL is already running on the target port
  const alreadyRunning = await isPortInUse(PORT, HOST);
  if (alreadyRunning) {
    console.log(`[PG-Server] PostgreSQL server is already running and active on ${HOST}:${PORT}.`);
    console.log('[PG-Server] Keeping process active in standby mode for concurrently/orchestration.');

    // Non-blocking keepalive to prevent concurrently from exiting
    const keepAlive = setInterval(() => {}, 60000);

    const onExit = () => {
      clearInterval(keepAlive);
      process.exit(0);
    };

    process.on('SIGINT', onExit);
    process.on('SIGTERM', onExit);
    return;
  }

  const dataDir = path.join(__dirname, '..', '.pgdata');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    // Only remove stale postmaster.pid when port is confirmed NOT in use
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        console.log('[PG-Server] Removed stale postmaster.pid file');
      } catch (e) {
        console.warn('[PG-Server] Could not remove postmaster.pid:', e.message);
      }
    }
  }

  console.log('[PG-Server] Initializing PGlite PostgreSQL engine at', dataDir);
  let db;
  let server;

  try {
    db = await PGlite.create({ dataDir });
    server = new PGLiteSocketServer({
      db,
      port: PORT,
      host: HOST,
      maxConnections: 100,
    });

    await server.start();
    console.log(`[PG-Server] PostgreSQL server listening on ${HOST}:${PORT} (maxConnections: 100)`);

    // Periodic checkpoint to prevent stale WAL in case of sudden terminal termination
    const cpInterval = setInterval(async () => {
      if (db && !isShuttingDown) {
        try { await db.query('CHECKPOINT'); } catch (_) {}
      }
    }, 60000);
    cpInterval.unref();
  } catch (err) {
    if (err && err.code === 'EADDRINUSE') {
      console.warn(`[PG-Server] Port ${PORT} was bound during startup by another instance. Entering standby.`);
      setInterval(() => {}, 60000);
      return;
    }
    throw err;
  }

  let isShuttingDown = false;
  const gracefulShutdown = async (signal) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log(`[PG-Server] ${signal} received, closing PostgreSQL server...`);

    const timeout = setTimeout(() => {
      console.warn('[PG-Server] Shutdown timed out, forcing exit.');
      process.exit(0);
    }, 4000);
    timeout.unref();

    try {
      if (server) await server.stop();
      if (db) {
        try { await db.query('CHECKPOINT'); } catch (_) {}
        await db.close();
      }
      console.log('[PG-Server] PostgreSQL server closed cleanly.');
      process.exit(0);
    } catch (e) {
      console.error('[PG-Server] Error during clean shutdown:', e);
      process.exit(1);
    }
  };

  process.on('SIGINT', () => gracefulShutdown('SIGINT'));
  process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
}

process.on('unhandledRejection', (reason) => {
  console.error('[PG-Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[PG-Server] Uncaught Exception:', err);
});

startServer().catch((err) => {
  console.error('[PG-Server] Failed to start PGlite server:', err);
  process.exit(1);
});
