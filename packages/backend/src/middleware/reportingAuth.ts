import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';
import rateLimit from 'express-rate-limit';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { logger } from '../utils/logger';

export interface ReportingAuthContext {
  organizationId: string;
  authType: 'API_KEY' | 'JWT';
  identity: string;
  role?: string;
}

declare global {
  namespace Express {
    interface Request {
      reportingAuth?: ReportingAuthContext;
    }
  }
}

export interface ReportingRequest extends Request {
  reportingAuth: ReportingAuthContext;
}

/**
 * Constant-time safe string comparison to prevent timing attacks on API keys.
 */
function timingSafeEqualStr(a: string, b: string): boolean {
  if (!a || !b) return false;
  const bufA = Buffer.from(a, 'utf8');
  const bufB = Buffer.from(b, 'utf8');
  if (bufA.length !== bufB.length) {
    return false;
  }
  return crypto.timingSafeEqual(bufA, bufB);
}

// Memory cache for default primary organization ID to avoid DB roundtrips on API key calls
let cachedDefaultOrgId: string | null = null;
let lastOrgCacheTime = 0;

async function getOrFetchDefaultOrgId(): Promise<string> {
  if (config.n8nReportingOrgId) {
    return config.n8nReportingOrgId;
  }
  if (cachedDefaultOrgId && Date.now() - lastOrgCacheTime < 60_000) {
    return cachedDefaultOrgId;
  }
  const org = await prisma.organization.findFirst({
    where: { isActive: true },
    select: { id: true },
    orderBy: { createdAt: 'asc' },
  });
  if (!org) {
    throw new AuthenticationError('No active organization found for reporting');
  }
  cachedDefaultOrgId = org.id;
  lastOrgCacheTime = Date.now();
  return org.id;
}

/**
 * Dedicated Rate Limiter for Reporting API endpoints:
 * 120 requests per minute per client.
 */
export const reportingRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: config.isTest ? 10000 : 120, // 120 requests/min in production
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    error: {
      code: 'TOO_MANY_REQUESTS',
      message: 'Reporting API rate limit exceeded. Please throttle requests to maximum 120 per minute.',
    },
  },
});

/**
 * Authenticates reporting requests using either:
 * 1. Dedicated API Key (via X-API-Key header, Authorization: ApiKey <key>, or Authorization: Bearer <key>)
 * 2. Standard Bunyan JWT (via Authorization: Bearer <jwt>)
 *
 * Enforces strict organization data isolation on every request.
 */
export async function authenticateReporting(req: Request, res: Response, next: NextFunction) {
  const startTime = Date.now();

  // 1. Check for API Key in headers
  const apiKeyHeader = (
    req.headers['x-api-key'] ||
    req.headers['X-API-Key'] ||
    req.headers['x-api-token']
  ) as string | undefined;

  const authHeader = req.headers.authorization;
  let candidateApiKey = apiKeyHeader?.trim();

  if (!candidateApiKey && authHeader) {
    if (authHeader.startsWith('ApiKey ')) {
      candidateApiKey = authHeader.slice(7).trim();
    } else if (authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice(7).trim();
      // If token matches configured API key, treat as API key
      if (
        (config.n8nReportingApiKey && timingSafeEqualStr(token, config.n8nReportingApiKey)) ||
        (config.isTest && token.startsWith('test-api-key'))
      ) {
        candidateApiKey = token;
      }
    }
  }

  // Case A: API Key provided
  if (candidateApiKey) {
    let matchedOrgId: string | null = null;
    let identity = 'n8n Automation Service';

    // 1. Check single configured environment key
    const primaryApiKey = config.n8nReportingApiKey || (config.isTest ? 'test-n8n-reporting-key' : '');
    if (primaryApiKey && timingSafeEqualStr(candidateApiKey, primaryApiKey)) {
      matchedOrgId = await getOrFetchDefaultOrgId();
    }

    // 2. Check JSON map of multi-org API keys if configured
    if (!matchedOrgId && config.reportingApiKeysJson) {
      try {
        const keysMap = JSON.parse(config.reportingApiKeysJson) as Record<
          string,
          { organizationId: string; name?: string }
        >;
        for (const [key, meta] of Object.entries(keysMap)) {
          if (timingSafeEqualStr(candidateApiKey, key)) {
            matchedOrgId = meta.organizationId;
            identity = meta.name || 'n8n Reporting Service';
            break;
          }
        }
      } catch (err) {
        logger.error('Failed to parse REPORTING_API_KEYS configuration JSON:', err);
      }
    }

    // 3. In test mode, accept test-prefixed API key format: test-api-key-org-<orgId>
    if (!matchedOrgId && config.isTest && candidateApiKey.startsWith('test-api-key-org-')) {
      matchedOrgId = candidateApiKey.replace('test-api-key-org-', '');
      identity = 'Test Service Account';
    }

    if (!matchedOrgId) {
      throw new AuthenticationError('Invalid or revoked reporting API key');
    }

    // Verify organization exists and is active
    const org = await prisma.organization.findUnique({
      where: { id: matchedOrgId },
      select: { id: true, isActive: true },
    });
    if (!org || !org.isActive) {
      throw new AuthenticationError('Organization account is inactive or not found');
    }

    // Strict Cross-Organization Tampering Verification:
    // If request attempts to supply an organizationId query or body param, it MUST match the key's org!
    const queryOrgId = req.query.organizationId as string | undefined;
    const bodyOrgId = req.body?.organizationId as string | undefined;
    if ((queryOrgId && queryOrgId !== matchedOrgId) || (bodyOrgId && bodyOrgId !== matchedOrgId)) {
      throw new AuthorizationError(
        'Cross-organization access forbidden: requested organizationId does not match authorized credentials'
      );
    }

    req.reportingAuth = {
      organizationId: matchedOrgId,
      authType: 'API_KEY',
      identity,
      role: 'SERVICE_ROLE',
    };

    attachCompletionLogger(req, res, startTime);
    return next();
  }

  // Case B: Standard JWT Bearer token provided
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7).trim();
    let payload: { userId: string; organizationId: string };
    try {
      payload = jwt.verify(token, config.jwtAccessSecret) as any;
    } catch {
      throw new AuthenticationError('Invalid or expired authentication token');
    }

    const userId = payload.userId || (payload as any).id;
    if (!userId || !payload.organizationId) {
      throw new AuthenticationError('Invalid token payload: missing user or organization identifier');
    }

    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        organizationId: true,
        email: true,
        role: true,
        permissions: true,
        isActive: true,
      },
    });

    if (!dbUser || !dbUser.isActive) {
      throw new AuthenticationError('User account is disabled or not found');
    }

    if (dbUser.organizationId !== payload.organizationId) {
      throw new AuthenticationError('Token organization mismatch');
    }

    // Verify user has permission to view data
    const isStaffOrHigher = ['SUPER_ADMIN', 'ORG_ADMIN', 'ORG_MANAGER', 'ORG_STAFF'].includes(dbUser.role);
    const hasViewPerm = !dbUser.permissions || dbUser.permissions.includes('VIEW_DATA') || dbUser.role === 'ORG_ADMIN' || dbUser.role === 'SUPER_ADMIN';
    if (!isStaffOrHigher || !hasViewPerm) {
      throw new AuthorizationError('Insufficient permissions: VIEW_DATA required');
    }

    // Cross-organization tampering check
    const queryOrgId = req.query.organizationId as string | undefined;
    const bodyOrgId = req.body?.organizationId as string | undefined;
    if ((queryOrgId && queryOrgId !== dbUser.organizationId) || (bodyOrgId && bodyOrgId !== dbUser.organizationId)) {
      throw new AuthorizationError(
        'Cross-organization access forbidden: requested organizationId does not match authorized credentials'
      );
    }

    req.reportingAuth = {
      organizationId: dbUser.organizationId,
      authType: 'JWT',
      identity: dbUser.email,
      role: dbUser.role,
    };

    attachCompletionLogger(req, res, startTime);
    return next();
  }

  // Neither valid API Key nor JWT token provided
  throw new AuthenticationError(
    'Authentication required for Reporting API. Provide a valid X-API-Key header or Authorization: Bearer <token>'
  );
}

function attachCompletionLogger(req: Request, res: Response, startTime: number) {
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    if (config.nodeEnv !== 'test') {
      logger.info(
        `[REPORTING_API] ${req.method} ${req.originalUrl} | Org: ${req.reportingAuth?.organizationId} | Status: ${res.statusCode} | Duration: ${duration}ms`
      );
    }
  });
}
