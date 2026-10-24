const { PGlite } = require('@electric-sql/pglite');
const { PGLiteSocketServer } = require('@electric-sql/pglite-socket');
const path = require('path');
const fs = require('fs');

async function startServer() {
  const dataDir = path.join(__dirname, '..', '.pgdata');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  } else {
    // Clean up stale postmaster.pid if present after unexpected termination
    const pidFile = path.join(dataDir, 'postmaster.pid');
    if (fs.existsSync(pidFile)) {
      try {
        fs.unlinkSync(pidFile);
        console.log('Removed stale postmaster.pid file');
      } catch (e) {
        console.warn('Could not remove postmaster.pid:', e.message);
      }
    }
  }

  console.log('Initializing PGlite PostgreSQL engine at', dataDir);
  const db = await PGlite.create({ dataDir });
  const server = new PGLiteSocketServer({
    db,
    port: 5432,
    host: '127.0.0.1',
    maxConnections: 100,
  });

  await server.start();
  console.log('PostgreSQL server listening on 127.0.0.1:5432 (maxConnections: 100)');

  process.on('SIGINT', async () => {
    await server.stop();
    await db.close();
    process.exit(0);
  });
}

startServer().catch((err) => {
  console.error('Failed to start PGlite server:', err);
  process.exit(1);
});
