import 'express-async-errors';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config';
import { logger } from './utils/logger';
import { errorHandler } from './middleware/errorHandler';
import { notFound } from './middleware/notFound';

// Routes
import authRouter from './routes/auth';
import orgRouter from './routes/organizations';
import clientRouter from './routes/clients';
import siteRouter from './routes/sites';
import workItemRouter from './routes/workItems';
import workEntryRouter from './routes/workEntries';
import statementRouter from './routes/statements';
import invoiceRouter from './routes/invoices';
import paymentRouter from './routes/payments';
import dashboardRouter from './routes/dashboard';
import reportRouter from './routes/reports';
import auditLogRouter from './routes/auditLogs';
import unitsRouter from './routes/units';

const app = express();

// ── Security ──────────────────────────────────────────────────
app.use(helmet());
app.use(cors({
  origin: config.corsOrigins,
  credentials: true,
}));

// ── Rate limiting ──────────────────────────────────────────────
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});
app.use('/api/', limiter as any);

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 50,
  skipSuccessfulRequests: true,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Too many failed login attempts, please try again later.',
    },
  },
});
app.use('/api/auth/login', authLimiter as any);

// ── Body parsing ───────────────────────────────────────────────
app.use(express.json({ limit: '5mb' }));
app.use(express.urlencoded({ extended: true, limit: '5mb' }));
app.use(compression() as any);

// ── Logging ────────────────────────────────────────────────────
if (config.nodeEnv !== 'test') {
  app.use(morgan('dev', {
    stream: { write: (msg) => logger.info(`[HTTP] ${msg.trim()}`) },
  }));
}

// ── Static files (uploads) ─────────────────────────────────────
app.use('/uploads', express.static(config.uploadDir));

// ── Health check ───────────────────────────────────────────────
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── API Routes ─────────────────────────────────────────────────
app.use('/api/auth', authRouter);
app.use('/api/dashboard', dashboardRouter);
app.use('/api/organizations', orgRouter);
app.use('/api/clients', clientRouter);
app.use('/api/sites', siteRouter);
app.use('/api/work-items', workItemRouter);
app.use('/api/work-entries', workEntryRouter);
app.use('/api/statements', statementRouter);
app.use('/api/invoices', invoiceRouter);
app.use('/api/payments', paymentRouter);
app.use('/api/reports', reportRouter);
app.use('/api/audit-logs', auditLogRouter);
app.use('/api/units', unitsRouter);

// ── Error handling ─────────────────────────────────────────────
app.use(notFound);
app.use(errorHandler);

export default app;
