import { Router } from 'express';
import { authService } from '../services/authService';
import { authenticate, AuthenticatedRequest } from '../middleware/auth';
import {
  validate,
  registerSchema,
  loginSchema,
  refreshSchema,
  changePasswordSchema,
  forgotPasswordSchema,
  verifyResetTokenSchema,
  resetPasswordSchema,
} from '../validators/auth';

const router = Router();

// POST /api/auth/register
router.post('/register', validate(registerSchema), async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  const result = await authService.register(req.body, ip);
  res.status(201).json({ success: true, data: result });
});

// POST /api/auth/login
router.post('/login', validate(loginSchema), async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  const result = await authService.login(req.body, ip);
  res.json({ success: true, data: result });
});

// POST /api/auth/refresh
router.post('/refresh', validate(refreshSchema), async (req, res) => {
  const result = await authService.refreshTokens(req.body.refreshToken);
  res.json({ success: true, data: result });
});

// POST /api/auth/logout
router.post('/logout', validate(refreshSchema), async (req, res) => {
  await authService.logout(req.body.refreshToken);
  res.json({ success: true, message: 'Logged out successfully' });
});

// GET /api/auth/me
router.get('/me', authenticate, async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  res.json({ success: true, data: authReq.user });
});

// PUT /api/auth/change-password
router.put('/change-password', authenticate, validate(changePasswordSchema), async (req, res) => {
  const authReq = req as AuthenticatedRequest;
  await authService.changePassword(
    authReq.user.id,
    req.body.currentPassword,
    req.body.newPassword
  );
  res.json({ success: true, message: 'Password changed successfully' });
});

// POST /api/auth/forgot-password
router.post('/forgot-password', validate(forgotPasswordSchema), async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  const origin = req.headers.origin;
  const result = await authService.requestPasswordReset(req.body.email, ip, origin);
  res.json({ success: true, data: result });
});

// GET /api/auth/verify-reset-token
router.get('/verify-reset-token', validate(verifyResetTokenSchema), async (req, res) => {
  const token = (req.query.token as string) || '';
  const result = await authService.verifyResetToken(token);
  res.json({ success: true, data: result });
});

// POST /api/auth/verify-reset-token
router.post('/verify-reset-token', validate(verifyResetTokenSchema), async (req, res) => {
  const token = (req.body.token as string) || (req.query.token as string) || '';
  const result = await authService.verifyResetToken(token);
  res.json({ success: true, data: result });
});

// POST /api/auth/reset-password
router.post('/reset-password', validate(resetPasswordSchema), async (req, res) => {
  const ip = req.ip || req.socket.remoteAddress;
  const result = await authService.resetPassword(req.body.token, req.body.newPassword, ip);
  res.json({ success: true, data: result });
});

export default router;
