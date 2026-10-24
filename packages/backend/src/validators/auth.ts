import { z } from 'zod';
import { Request, Response, NextFunction } from 'express';
import { ValidationError } from '../middleware/errorHandler';

export const passwordComplexitySchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number');

export const registerSchema = z.object({
  body: z.object({
    organizationName: z.string().optional(),
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: passwordComplexitySchema,
    nameAr: z.string().min(2, 'Name in Arabic is required'),
    nameEn: z.string().optional(),
  }),
});

export const loginSchema = z.object({
  body: z.object({
    email: z.string().trim().toLowerCase().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
    rememberMe: z.boolean().optional().default(false),
  }),
});

export const refreshSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

export const changePasswordSchema = z.object({
  body: z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: passwordComplexitySchema,
  }),
});

export const forgotPasswordSchema = z.object({
  body: z.object({
    email: z.string().trim().email('Invalid email address'),
  }),
});

export const verifyResetTokenSchema = z.object({
  query: z
    .object({
      token: z.string().min(1, 'Reset token is required').optional(),
    })
    .optional(),
  body: z
    .object({
      token: z.string().min(1, 'Reset token is required').optional(),
    })
    .optional(),
});

export const resetPasswordSchema = z.object({
  body: z
    .object({
      token: z.string().trim().min(1, 'Reset token is required'),
      newPassword: passwordComplexitySchema,
      confirmPassword: z.string().optional(),
    })
    .refine(
      (data) => !data.confirmPassword || data.newPassword === data.confirmPassword,
      {
        message: 'Passwords do not match',
        path: ['confirmPassword'],
      }
    ),
});

export function validate(schema: z.ZodTypeAny) {
  return (req: Request, _res: Response, next: NextFunction) => {
    const result = schema.safeParse({
      body: req.body,
      query: req.query,
      params: req.params,
    });

    if (!result.success) {
      const details = result.error.errors.map((e) => ({
        field: e.path.slice(1).join('.'),
        message: e.message,
      }));
      throw new ValidationError('Validation failed', details);
    }

    req.body = result.data.body ?? req.body;
    req.query = result.data.query ?? req.query;
    req.params = result.data.params ?? req.params;

    next();
  };
}
