import { PrismaClient } from '@prisma/client';
import { config } from '../config';

declare global {
  // eslint-disable-next-line no-var
  var __prisma: PrismaClient | undefined;
}

// Prevent multiple instances in development (hot reload)
export const prisma: PrismaClient =
  global.__prisma ||
  new PrismaClient({
    log: config.isTest
      ? []
      : config.nodeEnv === 'development'
        ? ['query', 'warn', 'error']
        : ['warn', 'error'],
  });

if (config.nodeEnv !== 'production') {
  global.__prisma = prisma;
}
