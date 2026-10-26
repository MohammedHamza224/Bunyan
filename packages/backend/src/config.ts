import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

// In production, strictly enforce strong secrets to prevent credential compromise
if (isProd) {
  const jwtAccess = process.env.JWT_ACCESS_SECRET;
  const jwtRefresh = process.env.JWT_REFRESH_SECRET;
  if (!jwtAccess || jwtAccess.includes('dev-access-secret') || jwtAccess.length < 32) {
    throw new Error('SECURITY FATAL: In production, JWT_ACCESS_SECRET must be explicitly set with a strong secret (at least 32 characters).');
  }
  if (!jwtRefresh || jwtRefresh.includes('dev-refresh-secret') || jwtRefresh.length < 32) {
    throw new Error('SECURITY FATAL: In production, JWT_REFRESH_SECRET must be explicitly set with a strong secret (at least 32 characters).');
  }
}

function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  nodeEnv: process.env.NODE_ENV || 'development',

  // JWT
  jwtAccessSecret: process.env.JWT_ACCESS_SECRET || 'dev-access-secret-change-in-production',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret-change-in-production',
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '24h',
  jwtStandardRefreshExpiresIn: process.env.JWT_STANDARD_REFRESH_EXPIRES_IN || '24h',
  jwtRememberMeExpiresIn: process.env.JWT_REMEMBER_ME_EXPIRES_IN || '30d',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim()),

  // File upload
  uploadDir: process.env.UPLOAD_DIR || './uploads',
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  isProd,
  isTest,
};
