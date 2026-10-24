import { Router, Response } from 'express';
import {
  authenticate,
  requirePermission,
  PERMISSIONS,
  AuthenticatedRequest,
} from '../middleware/auth';
import { getDashboardAnalytics } from '../services/reportingService';

const router = Router();

// All routes require authentication and VIEW_DATA permission
router.use(authenticate);

/**
 * GET /api/dashboard
 * Returns comprehensive financial & operational KPIs and recent lists for the authenticated user's organization.
 * Supports period filters: today, last7days, currentMonth, previousMonth, currentYear, custom (dateFrom/dateTo), all.
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const data = await getDashboardAnalytics(organizationId, {
    period: req.query.period as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    currency: req.query.currency as string | undefined,
  });

  res.json({
    success: true,
    data,
  });
});

export default router;
