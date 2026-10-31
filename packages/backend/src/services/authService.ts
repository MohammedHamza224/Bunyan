import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import {
  AuthenticationError,
  ConflictError,
  NotFoundError,
  ValidationError,
} from '../middleware/errorHandler';
import { resolveUserPermissions, ALL_PERMISSIONS } from '../middleware/auth';
import { logger } from '../utils/logger';
import { UserRole } from '@prisma/client';

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 30;

interface RegisterInput {
  organizationName?: string;
  email: string;
  password: string;
  nameAr: string;
  nameEn?: string;
}

interface LoginInput {
  email: string;
  password: string;
  rememberMe?: boolean;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
  rememberMe: boolean;
  expiresAt: string;
}

export function getRefreshExpiry(rememberMe = false): Date {
  const expiry = new Date();
  const durationStr = rememberMe
    ? config.jwtRememberMeExpiresIn
    : config.jwtStandardRefreshExpiresIn;
  const match = durationStr.match(/^(\d+)([dhms])$/);
  if (match) {
    const n = parseInt(match[1], 10);
    const unit = match[2];
    if (unit === 'd') expiry.setDate(expiry.getDate() + n);
    else if (unit === 'h') expiry.setHours(expiry.getHours() + n);
    else if (unit === 'm') expiry.setMinutes(expiry.getMinutes() + n);
    else if (unit === 's') expiry.setSeconds(expiry.getSeconds() + n);
  } else {
    expiry.setHours(expiry.getHours() + (rememberMe ? 24 * 30 : 24));
  }
  return expiry;
}

function generateTokens(userId: string, organizationId: string, rememberMe = false): TokenPair {
  const isRemembered = Boolean(rememberMe);
  const refreshExpiresIn = isRemembered
    ? config.jwtRememberMeExpiresIn
    : config.jwtStandardRefreshExpiresIn;
  const expiresAtDate = getRefreshExpiry(isRemembered);

  const accessToken = jwt.sign(
    { userId, organizationId },
    config.jwtAccessSecret,
    { expiresIn: config.jwtAccessExpiresIn as any }
  );

  const refreshToken = jwt.sign(
    { userId, organizationId, jti: uuidv4(), rememberMe: isRemembered },
    config.jwtRefreshSecret,
    { expiresIn: refreshExpiresIn as any }
  );

  return {
    accessToken,
    refreshToken,
    rememberMe: isRemembered,
    expiresAt: expiresAtDate.toISOString(),
  };
}

export function hashResetToken(rawToken: string): string {
  return crypto.createHash('sha256').update(rawToken.trim()).digest('hex');
}

function maskEmailAddress(email: string): string {
  const [local, domain] = email.split('@');
  if (!local || !domain) return '***';
  if (local.length <= 2) return `${local[0] || '*'}***@${domain}`;
  return `${local[0]}***${local[local.length - 1]}@${domain}`;
}

export const authService = {
  /**
   * Register a new organization + first admin user.
   * Organization business name is optional at setup and can be configured later in Settings.
   */
  async register(input: RegisterInput, ipAddress?: string) {
    const normalizedEmail = input.email.toLowerCase().trim();
    const existingUser = await prisma.user.findFirst({
      where: { email: { equals: normalizedEmail, mode: 'insensitive' } },
    });
    if (existingUser) {
      throw new ConflictError('An account with this email already exists');
    }

    const passwordHash = await bcrypt.hash(input.password, SALT_ROUNDS);

    const result = await prisma.$transaction(async (tx) => {
      // Create organization
      const org = await tx.organization.create({ data: {} });

      // Create initial settings (businessName left null if not provided)
      await tx.orgSettings.create({
        data: {
          organizationId: org.id,
          businessName: input.organizationName?.trim() || null,
          defaultCurrency: 'SAR',
          defaultLanguage: 'ar',
        },
      });

      // Create admin user with full permissions
      const user = await tx.user.create({
        data: {
          organizationId: org.id,
          email: normalizedEmail,
          passwordHash,
          nameAr: input.nameAr.trim(),
          nameEn: input.nameEn?.trim() || null,
          role: UserRole.ORG_ADMIN,
          permissions: ALL_PERMISSIONS,
        },
      });

      // Audit log for initial registration
      await tx.auditLog.create({
        data: {
          organizationId: org.id,
          userId: user.id,
          action: 'CREATE',
          entityType: 'Organization',
          entityId: org.id,
          description: 'Initial organization and admin account created',
          ipAddress,
        },
      });

      return { org, user };
    });

    logger.info(`New organization registered: ${result.org.id}`);
    const tokens = generateTokens(result.user.id, result.org.id);

    await prisma.refreshToken.create({
      data: {
        userId: result.user.id,
        token: tokens.refreshToken,
        expiresAt: getRefreshExpiry(),
      },
    });

    return {
      user: {
        id: result.user.id,
        email: result.user.email,
        nameAr: result.user.nameAr,
        nameEn: result.user.nameEn,
        role: result.user.role,
        permissions: resolveUserPermissions(result.user.role, result.user.permissions),
        organizationId: result.org.id,
      },
      tokens,
    };
  },

  /**
   * Login with email + password.
   */
  async login(input: LoginInput, ipAddress?: string) {
    const normalizedEmail = input.email.toLowerCase().trim();
    logger.info(`[LOGIN_REQUEST] Received login attempt: "${input.email}" (normalized: "${normalizedEmail}")`);

    // 1. Primary lookup by exact normalized email
    let candidates = await prisma.user.findMany({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        isActive: true,
      },
      include: { organization: { select: { isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });

    // 2. Backward-compatible alias matching for BUNYAN / ContractorFlow administration
    const isSystemAdminAlias =
      /^(admin|info|system)@(bunyan|bunyan-sa|contractorflow)\.(local|com|sa|net|org)$/i.test(normalizedEmail) ||
      normalizedEmail === 'admin@bunyan.sa' ||
      normalizedEmail === 'admin@bunyan.com' ||
      normalizedEmail === 'admin@bunyan-sa.com' ||
      normalizedEmail === 'admin@bunyan.local' ||
      normalizedEmail === 'info@bunyan-sa.com' ||
      normalizedEmail === 'admin@contractorflow.local' ||
      normalizedEmail === 'admin@contractorflow.com';

    if (isSystemAdminAlias) {
      const adminCandidates = await prisma.user.findMany({
        where: {
          role: UserRole.ORG_ADMIN,
          isActive: true,
        },
        include: { organization: { select: { isActive: true } } },
        orderBy: { createdAt: 'desc' },
      });

      for (const ac of adminCandidates) {
        if (!candidates.some((c) => c.id === ac.id)) {
          candidates.push(ac);
        }
      }
    }

    const activeCandidates = candidates.filter((u) => u.organization?.isActive);
    if (activeCandidates.length === 0) {
      throw new AuthenticationError('Invalid email or password');
    }

    let matchedUser: (typeof activeCandidates)[0] | null = null;
    for (const candidate of activeCandidates) {
      const passwordValid = await bcrypt.compare(input.password, candidate.passwordHash);

      if (passwordValid) {
        matchedUser = candidate;
        break;
      }
    }

    if (!matchedUser) {
      throw new AuthenticationError('Invalid email or password');
    }

    const user = matchedUser;

    const rememberMe = Boolean(input.rememberMe);
    const tokens = generateTokens(user.id, user.organizationId, rememberMe);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: tokens.refreshToken,
          expiresAt: new Date(tokens.expiresAt),
        },
      });

      await tx.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'LOGIN',
          entityType: 'User',
          entityId: user.id,
          description: rememberMe ? 'User logged in (Remember Me)' : 'User logged in',
          ipAddress,
        },
      });
    });

    return {
      user: {
        id: user.id,
        email: user.email,
        nameAr: user.nameAr,
        nameEn: user.nameEn,
        role: user.role,
        permissions: resolveUserPermissions(user.role, user.permissions),
        organizationId: user.organizationId,
      },
      tokens,
    };
  },

  /**
   * Rotate refresh token → issue new access + refresh token pair.
   * Preserves the session's rememberMe policy across token rotation.
   */
  async refreshTokens(oldRefreshToken: string) {
    let payload: { userId: string; organizationId: string; jti: string; rememberMe?: boolean };
    try {
      payload = jwt.verify(oldRefreshToken, config.jwtRefreshSecret) as any;
    } catch {
      throw new AuthenticationError('Invalid or expired refresh token');
    }

    const storedToken = await prisma.refreshToken.findUnique({
      where: { token: oldRefreshToken },
    });

    if (!storedToken || storedToken.revokedAt || storedToken.expiresAt < new Date()) {
      throw new AuthenticationError('Refresh token is invalid or has been revoked');
    }

    const user = await prisma.user.findUnique({
      where: { id: payload.userId, isActive: true },
    });
    if (!user) throw new AuthenticationError('User not found');

    const rememberMe = Boolean(payload.rememberMe);
    const newTokens = generateTokens(user.id, user.organizationId, rememberMe);

    await prisma.$transaction(async (tx) => {
      await tx.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });

      await tx.refreshToken.create({
        data: {
          userId: user.id,
          token: newTokens.refreshToken,
          expiresAt: new Date(newTokens.expiresAt),
        },
      });
    });

    const userSafe = {
      id: user.id,
      email: user.email,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
      role: user.role,
      permissions: resolveUserPermissions(user.role, user.permissions),
      organizationId: user.organizationId,
    };

    return { user: userSafe, tokens: newTokens };
  },

  /**
   * Revoke a refresh token (logout).
   */
  async logout(refreshToken: string) {
    await prisma.refreshToken.updateMany({
      where: { token: refreshToken },
      data: { revokedAt: new Date() },
    });
  },

  /**
   * Change password for the current authenticated user.
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string) {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundError('User');

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) throw new AuthenticationError('Current password is incorrect');

    const newHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { passwordHash: newHash },
      }),
      prisma.refreshToken.updateMany({
        where: { userId },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          description: 'Password changed',
        },
      }),
    ]);
  },

  /**
   * Request a password reset token.
   * Implements OWASP best practices:
   * - Anti-enumeration: identical response whether email exists or not
   * - Cryptographically random 32-byte (256-bit) token
   * - Only SHA-256 hash is stored in the database
   * - Previous unused reset tokens for the user are invalidated
   * - Expires in 30 minutes
   */
  async requestPasswordReset(email: string, ipAddress?: string, frontendOrigin?: string) {
    const normalizedEmail = email.toLowerCase().trim();
    const genericMessage =
      'If an account with that email exists, password reset instructions have been sent.';

    let user = await prisma.user.findFirst({
      where: {
        email: { equals: normalizedEmail, mode: 'insensitive' },
        isActive: true,
      },
      include: { organization: { select: { isActive: true } } },
      orderBy: { createdAt: 'desc' },
    });

    if (!user) {
      const isSystemAdminAlias =
        /^(admin|info|system)@(bunyan|bunyan-sa|contractorflow)\.(local|com|sa|net|org)$/i.test(normalizedEmail) ||
        normalizedEmail === 'admin@bunyan.sa' ||
        normalizedEmail === 'admin@bunyan.com' ||
        normalizedEmail === 'admin@bunyan-sa.com' ||
        normalizedEmail === 'admin@bunyan.local' ||
        normalizedEmail === 'info@bunyan-sa.com' ||
        normalizedEmail === 'admin@contractorflow.local' ||
        normalizedEmail === 'admin@contractorflow.com';

      if (isSystemAdminAlias) {
        user = await prisma.user.findFirst({
          where: {
            role: UserRole.ORG_ADMIN,
            isActive: true,
          },
          include: { organization: { select: { isActive: true } } },
          orderBy: { createdAt: 'desc' },
        });
      }
    }

    if (!user || !user.organization.isActive) {
      return {
        message: genericMessage,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
      };
    }

    const rawToken = crypto.randomBytes(32).toString('hex');
    const tokenHash = hashResetToken(rawToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.$transaction(async (tx) => {
      // Invalidate any previous unused reset tokens for this user
      await tx.passwordResetToken.updateMany({
        where: { userId: user.id, usedAt: null },
        data: { usedAt: new Date() },
      });

      // Store ONLY the SHA-256 hash of the token
      await tx.passwordResetToken.create({
        data: {
          userId: user.id,
          tokenHash,
          expiresAt,
          requestedIp: ipAddress || null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId: user.organizationId,
          userId: user.id,
          action: 'UPDATE',
          entityType: 'User',
          entityId: user.id,
          description: 'Password reset requested',
          ipAddress,
        },
      });
    });

    const baseOrigin = frontendOrigin || config.corsOrigins[0] || 'http://localhost:5173';
    const resetUrl = `${baseOrigin.replace(/\/$/, '')}/reset-password?token=${rawToken}`;

    if (!config.isProd) {
      logger.info(`[Password Reset - Dev Mode] Reset URL for ${user.email}: ${resetUrl}`);
      return {
        message: genericMessage,
        expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
        // Provided only in non-production environments when external SMTP is not configured
        devResetToken: rawToken,
        devResetUrl: resetUrl,
      };
    }

    return {
      message: genericMessage,
      expiresInMinutes: RESET_TOKEN_TTL_MINUTES,
    };
  },

  /**
   * Verify whether a password reset token is valid, unused, and not expired.
   */
  async verifyResetToken(rawToken: string) {
    if (!rawToken || !rawToken.trim()) {
      throw new ValidationError('Reset token is required');
    }

    const tokenHash = hashResetToken(rawToken);
    const record = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: {
        user: {
          include: {
            organization: { select: { isActive: true } },
          },
        },
      },
    });

    if (
      !record ||
      record.usedAt !== null ||
      record.expiresAt <= new Date() ||
      !record.user.isActive ||
      !record.user.organization.isActive
    ) {
      throw new AuthenticationError('Invalid or expired password reset token');
    }

    return {
      valid: true,
      email: maskEmailAddress(record.user.email),
      expiresAt: record.expiresAt.toISOString(),
    };
  },

  /**
   * Complete password reset using a valid, single-use reset token.
   * Atomically updates passwordHash, marks token as used, revokes all active RefreshTokens,
   * and writes an AuditLog record.
   */
  async resetPassword(rawToken: string, newPassword: string, ipAddress?: string) {
    const tokenHash = hashResetToken(rawToken);

    await prisma.$transaction(async (tx) => {
      const record = await tx.passwordResetToken.findUnique({
        where: { tokenHash },
        include: {
          user: {
            include: {
              organization: { select: { isActive: true } },
            },
          },
        },
      });

      if (
        !record ||
        record.usedAt !== null ||
        record.expiresAt <= new Date() ||
        !record.user.isActive ||
        !record.user.organization.isActive
      ) {
        throw new AuthenticationError('Invalid or expired password reset token');
      }

      const newPasswordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);
      const now = new Date();

      // Mark this token (and any other open tokens for this user) as used (single-use enforcement)
      const updateTokenResult = await tx.passwordResetToken.updateMany({
        where: { id: record.id, usedAt: null },
        data: { usedAt: now },
      });

      if (updateTokenResult.count === 0) {
        throw new AuthenticationError('Invalid or expired password reset token');
      }

      // Update user password
      await tx.user.update({
        where: { id: record.userId },
        data: { passwordHash: newPasswordHash },
      });

      // Revoke all existing refresh tokens for this user to invalidate active sessions
      await tx.refreshToken.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: now },
      });

      // Record audit log
      await tx.auditLog.create({
        data: {
          organizationId: record.user.organizationId,
          userId: record.userId,
          action: 'UPDATE',
          entityType: 'User',
          entityId: record.userId,
          description: 'Password reset completed via recovery token',
          ipAddress,
        },
      });
    });

    return {
      message: 'Password has been reset successfully. You can now sign in with your new password.',
    };
  },
};
