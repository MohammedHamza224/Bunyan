import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { config } from '../config';
import { prisma } from '../lib/prisma';
import { AuthenticationError, AuthorizationError } from './errorHandler';
import { UserRole } from '@prisma/client';

export const PERMISSIONS = {
  VIEW_DATA: 'VIEW_DATA',
  CREATE_WORK: 'CREATE_WORK',
  APPROVE_WORK: 'APPROVE_WORK',
  CREATE_STATEMENTS: 'CREATE_STATEMENTS',
  ISSUE_INVOICES: 'ISSUE_INVOICES',
  RECORD_PAYMENTS: 'RECORD_PAYMENTS',
  MANAGE_SETTINGS: 'MANAGE_SETTINGS',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const ALL_PERMISSIONS: Permission[] = Object.values(PERMISSIONS);

export const DEFAULT_ROLE_PERMISSIONS: Record<UserRole, Permission[]> = {
  SUPER_ADMIN: ALL_PERMISSIONS,
  ORG_ADMIN: ALL_PERMISSIONS,
  ORG_MANAGER: [
    PERMISSIONS.VIEW_DATA,
    PERMISSIONS.CREATE_WORK,
    PERMISSIONS.APPROVE_WORK,
    PERMISSIONS.CREATE_STATEMENTS,
    PERMISSIONS.ISSUE_INVOICES,
    PERMISSIONS.RECORD_PAYMENTS,
  ],
  ORG_STAFF: [
    PERMISSIONS.VIEW_DATA,
    PERMISSIONS.CREATE_WORK,
  ],
};

export function resolveUserPermissions(role: UserRole, customPermissions?: string[]): Permission[] {
  if (role === UserRole.SUPER_ADMIN || role === UserRole.ORG_ADMIN) {
    return ALL_PERMISSIONS;
  }
  if (customPermissions && customPermissions.length > 0) {
    return customPermissions as Permission[];
  }
  return DEFAULT_ROLE_PERMISSIONS[role] || [PERMISSIONS.VIEW_DATA];
}

export interface AuthenticatedUser {
  id: string;
  organizationId: string;
  email: string;
  role: UserRole;
  permissions: Permission[];
  nameAr: string;
  nameEn: string | null;
}

declare global {
  namespace Express {
    interface Request {
      user: AuthenticatedUser;
    }
  }
}

export interface AuthenticatedRequest extends Request<Record<string, string>, any, any, any> {
  user: AuthenticatedUser;
}

/**
 * Verify JWT access token and attach user + organizationId + effective permissions to request.
 * ALL organization-specific routes MUST use this middleware.
 */
export const authenticate = async (
  req: Request,
  _res: Response,
  next: NextFunction
) => {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    throw new AuthenticationError('No token provided');
  }

  const token = authHeader.slice(7);

  let payload: { userId: string; organizationId: string };
  try {
    payload = jwt.verify(token, config.jwtAccessSecret) as any;
  } catch {
    throw new AuthenticationError('Invalid or expired token');
  }

  const userId = payload.userId || (payload as any).id;
  if (!userId) {
    throw new AuthenticationError('Invalid token payload: missing user identifier');
  }

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      email: true,
      role: true,
      permissions: true,
      nameAr: true,
      nameEn: true,
      isActive: true,
    },
  });

  if (!user || !user.isActive) {
    throw new AuthenticationError('User account is disabled or not found');
  }

  // Verify org matches token claim (prevent token reuse across orgs)
  if (user.organizationId !== payload.organizationId) {
    throw new AuthenticationError('Token organization mismatch');
  }

  const effectivePermissions = resolveUserPermissions(user.role, user.permissions);

  (req as AuthenticatedRequest).user = {
    id: user.id,
    organizationId: user.organizationId,
    email: user.email,
    role: user.role,
    permissions: effectivePermissions,
    nameAr: user.nameAr,
    nameEn: user.nameEn,
  };
  next();
};

/**
 * Require specific roles. Must be used after `authenticate`.
 */
export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    if (!roles.includes(authReq.user.role)) {
      throw new AuthorizationError(
        `This action requires one of the following roles: ${roles.join(', ')}`
      );
    }
    next();
  };
};

/**
 * Require at least one of the specified granular permissions.
 * ORG_ADMIN and SUPER_ADMIN always pass.
 */
export const requirePermission = (...requiredPermissions: Permission[]) => {
  return (req: Request, _res: Response, next: NextFunction) => {
    const authReq = req as AuthenticatedRequest;
    const userPerms = authReq.user.permissions || [];
    const hasPerm = requiredPermissions.some((p) => userPerms.includes(p));
    if (!hasPerm) {
      throw new AuthorizationError(
        `Missing required permission: ${requiredPermissions.join(' or ')}`
      );
    }
    next();
  };
};

/**
 * Enforce organization isolation: ensure the requested resource's
 * organizationId matches the authenticated user's organizationId.
 */
export function assertSameOrg(
  userOrgId: string,
  resourceOrgId: string,
  resourceName = 'Resource'
): void {
  if (userOrgId !== resourceOrgId) {
    throw new AuthorizationError(`Access denied to ${resourceName} from another organization`);
  }
}
