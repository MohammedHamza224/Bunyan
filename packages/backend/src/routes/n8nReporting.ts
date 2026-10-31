import { Router, Response } from 'express';
import {
  authenticateReporting,
  reportingRateLimiter,
  ReportingRequest,
} from '../middleware/reportingAuth';
import {
  getWeeklyFinancialSummary,
  getMonthlyFinancialSummary,
  getInvoiceTotalsAndStatuses,
  getConfirmedPaymentCollections,
  getOutstandingReceivables,
  getClientFinancialSummaries,
  getSiteOperationalPerformance,
  getApprovedWorkEntries,
  getWorkCompletionStatistics,
} from '../services/n8nReportingService';

const router = Router();

// Apply dedicated reporting rate limiter and authentication to all endpoints
router.use(reportingRateLimiter as any);
router.use(authenticateReporting);

/**
 * Common response wrapper for reporting API
 */
function sendReportingResponse(req: ReportingRequest, res: Response, data: any) {
  res.json({
    success: true,
    data,
    meta: {
      organizationId: req.reportingAuth.organizationId,
      authType: req.reportingAuth.authType,
      identity: req.reportingAuth.identity,
      timestamp: new Date().toISOString(),
      version: '1.0',
    },
  });
}

/**
 * Integration Health & Verification Endpoint
 * GET /health
 */
router.get('/health', (req, res: Response) => {
  const authReq = req as ReportingRequest;
  sendReportingResponse(authReq, res, {
    status: 'healthy',
    message: 'Bunyan Reporting API for n8n is operational and authenticated',
    capabilities: [
      'weekly-summary',
      'monthly-summary',
      'invoices',
      'collections',
      'receivables',
      'clients',
      'sites',
      'work-entries/approved',
      'work-completion',
    ],
  });
});

/**
 * 1. WEEKLY FINANCIAL SUMMARY
 * GET /weekly-summary
 * Query params (pick one mode):
 *   Explicit range : startDate=YYYY-MM-DD & endDate=YYYY-MM-DD  (highest priority)
 *   Reference date : weekDate=YYYY-MM-DD  (returns the Mon–Sun week that contains it)
 *   Default        : no date params       (returns the current Mon–Sun week)
 * Optional: currency=SAR|USD|…, dateField=business|createdAt
 */
router.get('/weekly-summary', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getWeeklyFinancialSummary(authReq.reportingAuth.organizationId, {
    startDate: req.query.startDate as string | undefined,
    endDate:   req.query.endDate   as string | undefined,
    weekDate:  req.query.weekDate  as string | undefined,
    currency:  req.query.currency  as string | undefined,
    dateField: req.query.dateField as 'business' | 'createdAt' | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 2. MONTHLY FINANCIAL SUMMARY
 * GET /monthly-summary
 * Query params: month (YYYY-MM), currency, dateField (business|createdAt)
 */
router.get('/monthly-summary', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getMonthlyFinancialSummary(authReq.reportingAuth.organizationId, {
    month:     req.query.month as string | undefined,
    currency:  req.query.currency as string | undefined,
    dateField: req.query.dateField as 'business' | 'createdAt' | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 3. INVOICE TOTALS AND STATUSES
 * GET /invoices
 * Query params: period, dateFrom, dateTo, currency
 */
router.get('/invoices', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getInvoiceTotalsAndStatuses(authReq.reportingAuth.organizationId, {
    period: req.query.period as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    currency: req.query.currency as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 4. CONFIRMED PAYMENT COLLECTIONS
 * GET /collections
 * Query params: period, dateFrom, dateTo, clientId, paymentMethod, page, limit
 */
router.get('/collections', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getConfirmedPaymentCollections(authReq.reportingAuth.organizationId, {
    period: req.query.period as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    clientId: req.query.clientId as string | undefined,
    paymentMethod: req.query.paymentMethod as string | undefined,
    page: req.query.page as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 5. OUTSTANDING RECEIVABLES & AGING ANALYSIS
 * GET /receivables
 * Query params: clientId, page, limit
 */
router.get('/receivables', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getOutstandingReceivables(authReq.reportingAuth.organizationId, {
    clientId: req.query.clientId as string | undefined,
    page: req.query.page as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 6. CLIENT FINANCIAL SUMMARIES
 * GET /clients
 * Query params: search, page, limit
 */
router.get('/clients', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getClientFinancialSummaries(authReq.reportingAuth.organizationId, {
    search: req.query.search as string | undefined,
    page: req.query.page as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 7. SITE OPERATIONAL PERFORMANCE
 * GET /sites
 * Query params: clientId, status, page, limit
 */
router.get('/sites', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getSiteOperationalPerformance(authReq.reportingAuth.organizationId, {
    clientId: req.query.clientId as string | undefined,
    status: req.query.status as string | undefined,
    page: req.query.page as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 8. APPROVED WORK ENTRIES
 * GET /work-entries/approved
 * Query params: period, dateFrom, dateTo, clientId, siteId, page, limit
 */
router.get('/work-entries/approved', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getApprovedWorkEntries(authReq.reportingAuth.organizationId, {
    period: req.query.period as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    clientId: req.query.clientId as string | undefined,
    siteId: req.query.siteId as string | undefined,
    page: req.query.page as string | undefined,
    limit: req.query.limit as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

/**
 * 9. WORK COMPLETION STATISTICS
 * GET /work-completion
 * Query params: period, dateFrom, dateTo, siteId
 */
router.get('/work-completion', async (req, res: Response) => {
  const authReq = req as ReportingRequest;
  const data = await getWorkCompletionStatistics(authReq.reportingAuth.organizationId, {
    period: req.query.period as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    siteId: req.query.siteId as string | undefined,
  });
  sendReportingResponse(authReq, res, data);
});

export default router;
