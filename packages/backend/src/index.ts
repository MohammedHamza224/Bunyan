import app from './app';
import { config } from './config';
import { logger } from './utils/logger';
import { prisma } from './lib/prisma';

async function main() {
  try {
    // Connect to DB with retry loop to handle concurrent startup
    let connected = false;
    let retries = 10;
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

    // Graceful shutdown
    const shutdown = async (signal: string) => {
      logger.info(`${signal} received — shutting down gracefully`);
      server.close(async () => {
        await prisma.$disconnect();
        logger.info('Server closed');
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
