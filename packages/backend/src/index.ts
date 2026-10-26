import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';

// Register global handlers to prevent abrupt process termination
process.on('uncaughtException', (err: Error) => {
  logger.error('Uncaught Exception in backend process:', {
    message: err.message,
    stack: err.stack,
  });
});

process.on('unhandledRejection', (reason: unknown) => {
  logger.error('Unhandled Promise Rejection in backend process:', { reason });
});

async function main() {
  try {
    // Connect to DB with resilient retry loop to handle concurrent startup
    let connected = false;
    let retries = 30;
    while (!connected && retries > 0) {
      try {
        await prisma.$connect();
        connected = true;
        logger.info('Database connected successfully');
      } catch (err: any) {
        retries--;
        if (retries === 0) throw err;
        logger.warn(`Database not ready yet (${err.message || 'connecting...'}), retrying in 1s... (${retries} attempts left)`);
        await new Promise((res) => setTimeout(res, 1000));
      }
    }

    const server = app.listen(config.port, () => {
      logger.info(`ContractorFlow API server running on port ${config.port} [${config.nodeEnv}]`);
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        logger.error(`Port ${config.port} is already in use by another process. Please free port ${config.port} or check running instances.`);
      } else {
        logger.error('HTTP server encountered an error:', err);
      }
      process.exit(1);
    });

    // Graceful shutdown with idle connection teardown and safety fallback timer
    let isShuttingDown = false;
    const shutdown = async (signal: string) => {
      if (isShuttingDown) return;
      isShuttingDown = true;
      logger.info(`${signal} received — shutting down gracefully`);

      const forceExitTimer = setTimeout(() => {
        logger.warn('Forced shutdown timeout reached (3s), exiting.');
        process.exit(0);
      }, 3000);
      forceExitTimer.unref();

      if (typeof (server as any).closeIdleConnections === 'function') {
        (server as any).closeIdleConnections();
      }

      server.close(async (err) => {
        if (err) {
          logger.error('Error closing HTTP server:', err);
        }
        try {
          await prisma.$disconnect();
          logger.info('Database disconnected and server closed cleanly');
        } catch (dbErr) {
          logger.error('Error during database disconnect:', dbErr);
        }
        process.exit(0);
      });
    };

    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));

  } catch (error) {
    logger.error('Failed to start server', error);
    process.exit(1);
  }
}

main();
