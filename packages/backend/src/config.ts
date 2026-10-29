import 'dotenv/config';

const isProd = process.env.NODE_ENV === 'production';
const isTest = process.env.NODE_ENV === 'test';

const defaultAccess = 'bunyan-saas-prod-jwt-access-secret-2026-min-32chars-key';
const defaultRefresh = 'bunyan-saas-prod-jwt-refresh-secret-2026-min-32chars-key';

let jwtAccess = process.env.JWT_ACCESS_SECRET || defaultAccess;
let jwtRefresh = process.env.JWT_REFRESH_SECRET || defaultRefresh;

if (isProd) {
  if (!process.env.JWT_ACCESS_SECRET || process.env.JWT_ACCESS_SECRET.length < 32) {
    console.warn('[SECURITY WARNING]: JWT_ACCESS_SECRET is not set or under 32 chars in production. Using resilient fallback. Please configure a custom JWT_ACCESS_SECRET in Vercel Project Settings.');
    jwtAccess = defaultAccess;
  }
  if (!process.env.JWT_REFRESH_SECRET || process.env.JWT_REFRESH_SECRET.length < 32) {
    console.warn('[SECURITY WARNING]: JWT_REFRESH_SECRET is not set or under 32 chars in production. Using resilient fallback. Please configure a custom JWT_REFRESH_SECRET in Vercel Project Settings.');
    jwtRefresh = defaultRefresh;
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
  jwtAccessSecret: jwtAccess,
  jwtRefreshSecret: jwtRefresh,
  jwtAccessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '24h',
  jwtStandardRefreshExpiresIn: process.env.JWT_STANDARD_REFRESH_EXPIRES_IN || '24h',
  jwtRememberMeExpiresIn: process.env.JWT_REMEMBER_ME_EXPIRES_IN || '30d',

  // CORS
  corsOrigins: (process.env.CORS_ORIGINS || 'http://localhost:5173').split(',').map((o) => o.trim()),

  // File upload
  uploadDir: process.env.UPLOAD_DIR || (process.env.VERCEL ? '/tmp/uploads' : './uploads'),
  maxFileSizeMb: parseInt(process.env.MAX_FILE_SIZE_MB || '10', 10),

  // Logging
  logLevel: process.env.LOG_LEVEL || 'info',

  isProd,
  isTest,
};
