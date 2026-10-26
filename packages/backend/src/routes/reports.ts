import { Router, Response } from 'express';
import ExcelJS from 'exceljs';
import {
  authenticate,
  requirePermission,
  PERMISSIONS,
  AuthenticatedRequest,
} from '../middleware/auth';
import { ValidationError } from '../middleware/errorHandler';
import {
  getInvoicesReport,
  getStatementsReport,
  getWorkEntriesReport,
  getCollectionsReport,
  getReceivablesReport,
  getCustomerStatementReport,
  getSitesReport,
  getAgingReport,
} from '../services/reportingService';

const router = Router();

// All reporting routes require authentication and VIEW_DATA permission
router.use(authenticate);
router.use(requirePermission(PERMISSIONS.VIEW_DATA));

/**
 * GET /api/reports/invoices
 */
router.get('/invoices', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const report = await getInvoicesReport(authReq.user.organizationId, req.query);
  const { allMatchingItems: _all, ...responseData } = report;
  res.json({ success: true, data: responseData });
});

/**
 * GET /api/reports/statements
 */
router.get('/statements', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const report = await getStatementsReport(authReq.user.organizationId, req.query);
  const { allMatchingItems: _all, ...responseData } = report;
  res.json({ success: true, data: responseData });
});

/**
 * GET /api/reports/work-entries
 */
router.get('/work-entries', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const report = await getWorkEntriesReport(authReq.user.organizationId, req.query);
  const { allMatchingItems: _all, ...responseData } = report;
  res.json({ success: true, data: responseData });
});

/**
 * GET /api/reports/collections
 */
router.get('/collections', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const report = await getCollectionsReport(authReq.user.organizationId, req.query);
  const { allMatchingItems: _all, ...responseData } = report;
  res.json({ success: true, data: responseData });
});

/**
 * GET /api/reports/receivables
 */
router.get('/receivables', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const report = await getReceivablesReport(authReq.user.organizationId, req.query);
  const { allMatchingItems: _all, ...responseData } = report;
  res.json({ success: true, data: responseData });
});

/**
 * GET /api/reports/customer-statement
 */
router.get('/customer-statement', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const data = await getCustomerStatementReport(authReq.user.organizationId, {
    clientId: req.query.clientId as string | undefined,
    dateFrom: req.query.dateFrom as string | undefined,
    dateTo: req.query.dateTo as string | undefined,
    period: req.query.period as string | undefined,
    currency: req.query.currency as string | undefined,
    transactionType: req.query.transactionType as string | undefined,
  });
  res.json({ success: true, data });
});

/**
 * GET /api/reports/sites
 */
router.get('/sites', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const data = await getSitesReport(authReq.user.organizationId, req.query);
  res.json({ success: true, data });
});

/**
 * GET /api/reports/aging
 */
router.get('/aging', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const data = await getAgingReport(authReq.user.organizationId, req.query);
  res.json({ success: true, data });
});

/**
 * GET /api/reports/export/excel
 * Generates a native .xlsx workbook using the exact same report data & calculations.
 * Dates are stored as Date objects, monetary values are stored as numeric values.
 */
router.get('/export/excel', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;
  const reportType = String(req.query.reportType || req.query.type || 'invoices');
  const isAr = (req.query.lang || 'ar') === 'ar';

  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BUNYAN';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(isAr ? 'التقرير المالي' : 'Financial Report', {
    views: [{ rightToLeft: isAr }],
  });

  const numFmt = '#,##0.00';
  const dateFmt = 'yyyy-mm-dd';

  if (reportType === 'invoices') {
    const report = await getInvoicesReport(organizationId, { ...req.query, limit: 5000, page: 1 });
    sheet.columns = [
      { header: isAr ? 'رقم الفاتورة' : 'Invoice No', key: 'referenceNo', width: 18 },
      { header: isAr ? 'تاريخ الإصدار' : 'Issue Date', key: 'issueDate', width: 14 },
      { header: isAr ? 'تاريخ الاستحقاق' : 'Due Date', key: 'dueDate', width: 14 },
      { header: isAr ? 'العميل' : 'Client', key: 'clientName', width: 28 },
      { header: isAr ? 'النوع' : 'Type', key: 'invoiceType', width: 22 },
      { header: isAr ? 'العملة' : 'Currency', key: 'currency', width: 10 },
      { header: isAr ? 'الإجمالي الأصلي' : 'Gross Total', key: 'grossAmount', width: 16 },
      { header: isAr ? 'صافي الفاتورة' : 'Net Amount', key: 'netAmount', width: 16 },
      { header: isAr ? 'المدفوع' : 'Paid Amount', key: 'paidAmount', width: 16 },
      { header: isAr ? 'المتبقي' : 'Remaining', key: 'remainingAmount', width: 16 },
      { header: isAr ? 'الحالة' : 'Status', key: 'status', width: 14 },
    ];

    for (const row of report.allMatchingItems) {
      const added = sheet.addRow({
        referenceNo: row.referenceNo,
        issueDate: new Date(row.issueDate),
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        clientName: isAr ? row.client?.nameAr : row.client?.nameEn || row.client?.nameAr,
        invoiceType: row.invoiceType,
        currency: row.currency,
        grossAmount: Number(row.grossAmount),
        netAmount: Number(row.netAmount),
        paidAmount: Number(row.paidAmount),
        remainingAmount: Number(row.remainingAmount),
        status: row.status,
      });
      added.getCell('issueDate').numFmt = dateFmt;
      if (row.dueDate) added.getCell('dueDate').numFmt = dateFmt;
      added.getCell('grossAmount').numFmt = numFmt;
      added.getCell('netAmount').numFmt = numFmt;
      added.getCell('paidAmount').numFmt = numFmt;
      added.getCell('remainingAmount').numFmt = numFmt;
    }

    for (const currBucket of report.summary.byCurrency) {
      const totalRow = sheet.addRow({
        referenceNo: isAr ? `الإجمالي (${currBucket.currency})` : `Total (${currBucket.currency})`,
        currency: currBucket.currency,
        grossAmount: Number(currBucket.grossTotal),
        netAmount: Number(currBucket.netTotal),
        paidAmount: Number(currBucket.paidTotal),
        remainingAmount: Number(currBucket.remainingTotal),
      });
      totalRow.font = { bold: true };
      totalRow.getCell('grossAmount').numFmt = numFmt;
      totalRow.getCell('netAmount').numFmt = numFmt;
      totalRow.getCell('paidAmount').numFmt = numFmt;
      totalRow.getCell('remainingAmount').numFmt = numFmt;
    }
  } else if (reportType === 'customer-statement') {
    const stmt = await getCustomerStatementReport(organizationId, {
      clientId: req.query.clientId as string | undefined,
      dateFrom: req.query.dateFrom as string | undefined,
      dateTo: req.query.dateTo as string | undefined,
      period: req.query.period as string | undefined,
      currency: req.query.currency as string | undefined,
      transactionType: req.query.transactionType as string | undefined,
    });

    sheet.columns = [
      { header: isAr ? 'التاريخ' : 'Date', key: 'date', width: 14 },
      { header: isAr ? 'رقم المستند' : 'Document No', key: 'documentNo', width: 18 },
      { header: isAr ? 'المرجع المقترن' : 'Related Ref', key: 'relatedRef', width: 18 },
      { header: isAr ? 'نوع الحركة' : 'Type', key: 'transactionType', width: 16 },
      { header: isAr ? 'البيان' : 'Description', key: 'description', width: 38 },
      { header: isAr ? 'العملة' : 'Currency', key: 'currency', width: 10 },
      { header: isAr ? 'مدين (Debit)' : 'Debit', key: 'debit', width: 16 },
      { header: isAr ? 'دائن (Credit)' : 'Credit', key: 'credit', width: 16 },
      { header: isAr ? 'الرصيد التراكمي' : 'Running Balance', key: 'runningBalance', width: 18 },
    ];

    if (stmt.openingBalanceAvailable) {
      const openRow = sheet.addRow({
        documentNo: 'OPENING',
        relatedRef: '-',
        description: isAr ? 'الرصيد الافتتاحي' : 'Opening Balance',
        currency: stmt.filters?.currency || stmt.currency || 'SAR',
        debit: 0,
        credit: 0,
        runningBalance: Number(stmt.openingBalance || 0),
      });
      openRow.font = { bold: true };
      openRow.getCell('runningBalance').numFmt = numFmt;
    }

    for (const tx of stmt.transactions) {
      const added = sheet.addRow({
        date: new Date(tx.date),
        documentNo: tx.documentNo,
        relatedRef: tx.relatedRef || '-',
        transactionType: tx.transactionType,
        description: isAr ? tx.descriptionAr : tx.descriptionEn,
        currency: tx.currency,
        debit: Number(tx.debit),
        credit: Number(tx.credit),
        runningBalance: tx.runningBalance !== null ? Number(tx.runningBalance) : '',
      });
      added.getCell('date').numFmt = dateFmt;
      added.getCell('debit').numFmt = numFmt;
      added.getCell('credit').numFmt = numFmt;
      if (tx.runningBalance !== null) {
        added.getCell('runningBalance').numFmt = numFmt;
      }
    }

    const closeRow = sheet.addRow({
      documentNo: 'CLOSING',
      relatedRef: '-',
      description: isAr ? 'الإجمالي والرصيد الختامي' : 'Totals & Closing Balance',
      currency: stmt.filters?.currency || stmt.currency || 'SAR',
      debit: Number(stmt.totalDebits || 0),
      credit: Number(stmt.totalCredits || 0),
      runningBalance: stmt.closingBalance !== null ? Number(stmt.closingBalance) : (isAr ? 'غير متاح' : 'N/A'),
    });
    closeRow.font = { bold: true };
    closeRow.getCell('debit').numFmt = numFmt;
    closeRow.getCell('credit').numFmt = numFmt;
    if (stmt.closingBalance !== null) {
      closeRow.getCell('runningBalance').numFmt = numFmt;
    }
  } else if (reportType === 'aging') {
    const aging = await getAgingReport(organizationId, req.query);
    sheet.columns = [
      { header: isAr ? 'العميل' : 'Client', key: 'clientName', width: 28 },
      { header: isAr ? 'رقم الفاتورة' : 'Invoice No', key: 'referenceNo', width: 18 },
      { header: isAr ? 'تاريخ الإصدار' : 'Issue Date', key: 'issueDate', width: 14 },
      { header: isAr ? 'تاريخ الاستحقاق' : 'Due Date', key: 'dueDate', width: 14 },
      { header: isAr ? 'العملة' : 'Currency', key: 'currency', width: 10 },
      { header: isAr ? 'الرصيد المتبقي' : 'Outstanding Balance', key: 'outstandingBalance', width: 18 },
      { header: isAr ? 'أيام التأخير' : 'Overdue Days', key: 'overdueDays', width: 14 },
      { header: isAr ? 'فئة عمر الدين' : 'Aging Bucket', key: 'bucket', width: 18 },
    ];

    for (const row of aging.items) {
      const added = sheet.addRow({
        clientName: isAr ? row.client?.nameAr : row.client?.nameEn || row.client?.nameAr,
        referenceNo: row.referenceNo,
        issueDate: new Date(row.issueDate),
        dueDate: row.dueDate ? new Date(row.dueDate) : null,
        currency: row.currency,
        outstandingBalance: Number(row.outstandingBalance),
        overdueDays: row.overdueDays ?? '',
        bucket: row.bucket,
      });
      added.getCell('issueDate').numFmt = dateFmt;
      if (row.dueDate) added.getCell('dueDate').numFmt = dateFmt;
      added.getCell('outstandingBalance').numFmt = numFmt;
    }

    for (const b of aging.byCurrency) {
      const totalRow = sheet.addRow({
        clientName: isAr ? `الإجمالي (${b.currency})` : `Total (${b.currency})`,
        currency: b.currency,
        outstandingBalance: Number(b.totalOutstanding),
      });
      totalRow.font = { bold: true };
      totalRow.getCell('outstandingBalance').numFmt = numFmt;
    }
  } else if (reportType === 'collections') {
    const report = await getCollectionsReport(organizationId, { ...req.query, limit: 5000, page: 1 });
    sheet.columns = [
      { header: isAr ? 'تاريخ الدفع' : 'Payment Date', key: 'paymentDate', width: 14 },
      { header: isAr ? 'رقم المرجع' : 'Reference No', key: 'referenceNo', width: 18 },
      { header: isAr ? 'العميل' : 'Client', key: 'clientName', width: 26 },
      { header: isAr ? 'الفاتورة المرتبطة' : 'Invoice Ref', key: 'invoiceRef', width: 18 },
      { header: isAr ? 'طريقة الدفع' : 'Method', key: 'method', width: 16 },
      { header: isAr ? 'العملة' : 'Currency', key: 'currency', width: 10 },
      { header: isAr ? 'المبلغ' : 'Amount', key: 'amount', width: 16 },
      { header: isAr ? 'الحالة' : 'Status', key: 'status', width: 14 },
    ];

    for (const row of report.allMatchingItems) {
      const added = sheet.addRow({
        paymentDate: new Date(row.paymentDate),
        referenceNo: row.referenceNo,
        clientName: isAr ? row.client?.nameAr || '-' : row.client?.nameEn || row.client?.nameAr || '-',
        invoiceRef: row.invoice?.referenceNo || '-',
        method: row.method,
        currency: row.currency,
        amount: Number(row.amount),
        status: row.status,
      });
      added.getCell('paymentDate').numFmt = dateFmt;
      added.getCell('amount').numFmt = numFmt;
    }

    for (const b of report.summary.byCurrency) {
      const totalRow = sheet.addRow({
        referenceNo: isAr ? `إجمالي التحصيل الفعال (${b.currency})` : `Active Collected (${b.currency})`,
        currency: b.currency,
        amount: Number(b.totalCollected),
        status: 'ACTIVE',
      });
      totalRow.font = { bold: true };
      totalRow.getCell('amount').numFmt = numFmt;
    }
  } else if (reportType === 'sites') {
    const report = await getSitesReport(organizationId, req.query);
    sheet.columns = [
      { header: isAr ? 'الموقع' : 'Site', key: 'siteName', width: 26 },
      { header: isAr ? 'العميل' : 'Client', key: 'clientName', width: 26 },
      { header: isAr ? 'العملة' : 'Currency', key: 'currency', width: 10 },
      { header: isAr ? 'قيمة الأعمال المسجلة' : 'Recorded Work', key: 'recorded', width: 18 },
      { header: isAr ? 'قيمة الأعمال المعتمدة' : 'Approved Work', key: 'approved', width: 18 },
      { header: isAr ? 'الأعمال المعتمدة غير المفوترة' : 'Uninvoiced Approved', key: 'uninvoiced', width: 20 },
      { header: isAr ? 'إجمالي الفواتير الصادرة' : 'Issued Invoices', key: 'invoiced', width: 18 },
      { header: isAr ? 'صافي الفواتير بعد الإشعارات' : 'Net Invoices', key: 'netInvoiced', width: 18 },
      { header: isAr ? 'التحصيلات الفعلية' : 'Collections', key: 'collections', width: 18 },
      { header: isAr ? 'الرصيد المتبقي' : 'Outstanding', key: 'outstanding', width: 18 },
    ];

    for (const row of report.items) {
      const added = sheet.addRow({
        siteName: isAr ? row.site.nameAr : row.site.nameEn || row.site.nameAr,
        clientName: isAr ? row.client.nameAr : row.client.nameEn || row.client.nameAr,
        currency: row.currency,
        recorded: Number(row.financialSummary.totalRecordedWorkValue),
        approved: Number(row.financialSummary.totalApprovedWorkValue),
        uninvoiced: Number(row.financialSummary.approvedUninvoicedWorkValue),
        invoiced: Number(row.financialSummary.totalIssuedInvoiceValue),
        netInvoiced: Number(row.financialSummary.netInvoiceValue),
        collections: Number(row.financialSummary.totalActualCollections),
        outstanding: Number(row.financialSummary.outstandingBalance),
      });
      added.getCell('recorded').numFmt = numFmt;
      added.getCell('approved').numFmt = numFmt;
      added.getCell('uninvoiced').numFmt = numFmt;
      added.getCell('invoiced').numFmt = numFmt;
      added.getCell('netInvoiced').numFmt = numFmt;
      added.getCell('collections').numFmt = numFmt;
      added.getCell('outstanding').numFmt = numFmt;
    }
  } else {
    throw new ValidationError(`Unsupported export reportType: ${reportType}`);
  }

  sheet.getRow(1).font = { bold: true };

  res.setHeader(
    'Content-Type',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  );
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="bunyan-${reportType}-${new Date().toISOString().slice(0, 10)}.xlsx"`
  );

  const buffer = await workbook.xlsx.writeBuffer();
  res.send(Buffer.from(buffer));
});

export default router;
