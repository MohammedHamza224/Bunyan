import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
import {
  authenticate,
  requirePermission,
  AuthenticatedRequest,
  PERMISSIONS,
} from '../middleware/auth';
import { ValidationError, BusinessRuleError, NotFoundError } from '../middleware/errorHandler';

const router = Router();

// Standard Construction Catalog
export const STANDARD_CONSTRUCTION_UNITS = [
  {
    code: 'SQM',
    nameAr: 'متر مربع',
    nameEn: 'Square Meter',
    symbolAr: 'م²',
    symbolEn: 'm²',
    category: 'AREA',
    isDefault: true,
    sortOrder: 1,
  },
  {
    code: 'CBM',
    nameAr: 'متر مكعب',
    nameEn: 'Cubic Meter',
    symbolAr: 'م³',
    symbolEn: 'm³',
    category: 'VOLUME',
    isDefault: false,
    sortOrder: 2,
  },
  {
    code: 'LM',
    nameAr: 'متر طولي',
    nameEn: 'Linear Meter',
    symbolAr: 'م ط',
    symbolEn: 'lm',
    category: 'LENGTH',
    isDefault: false,
    sortOrder: 3,
  },
  {
    code: 'PCS',
    nameAr: 'قطعة',
    nameEn: 'Piece',
    symbolAr: 'قطعة',
    symbolEn: 'pc',
    category: 'COUNT',
    isDefault: false,
    sortOrder: 4,
  },
  {
    code: 'KG',
    nameAr: 'كيلوجرام',
    nameEn: 'Kilogram',
    symbolAr: 'كجم',
    symbolEn: 'kg',
    category: 'WEIGHT',
    isDefault: false,
    sortOrder: 5,
  },
  {
    code: 'TON',
    nameAr: 'طن',
    nameEn: 'Ton',
    symbolAr: 'طن',
    symbolEn: 'ton',
    category: 'WEIGHT',
    isDefault: false,
    sortOrder: 6,
  },
  {
    code: 'LTR',
    nameAr: 'لتر',
    nameEn: 'Liter',
    symbolAr: 'لتر',
    symbolEn: 'L',
    category: 'VOLUME',
    isDefault: false,
    sortOrder: 7,
  },
  {
    code: 'HR',
    nameAr: 'ساعة',
    nameEn: 'Hour',
    symbolAr: 'ساعة',
    symbolEn: 'hr',
    category: 'TIME',
    isDefault: false,
    sortOrder: 8,
  },
  {
    code: 'DAY',
    nameAr: 'يوم',
    nameEn: 'Day',
    symbolAr: 'يوم',
    symbolEn: 'day',
    category: 'TIME',
    isDefault: false,
    sortOrder: 9,
  },
  {
    code: 'LUMP_SUM',
    nameAr: 'مقطوعية',
    nameEn: 'Lump Sum',
    symbolAr: 'مقطوعية',
    symbolEn: 'LS',
    category: 'SERVICE',
    isDefault: false,
    sortOrder: 10,
  },
  {
    code: 'BAG',
    nameAr: 'كيس',
    nameEn: 'Bag',
    symbolAr: 'كيس',
    symbolEn: 'bag',
    category: 'COUNT',
    isDefault: false,
    sortOrder: 11,
  },
  {
    code: 'SET',
    nameAr: 'طقم',
    nameEn: 'Set',
    symbolAr: 'طقم',
    symbolEn: 'set',
    category: 'COUNT',
    isDefault: false,
    sortOrder: 12,
  },
];

/**
 * Ensures standard construction units exist for the given organization.
 */
export async function ensureStandardUnitsForOrg(organizationId: string) {
  const count = await prisma.unitOfMeasure.count({ where: { organizationId } });
  if (count === 0) {
    for (const unit of STANDARD_CONSTRUCTION_UNITS) {
      await prisma.unitOfMeasure.create({
        data: {
          organizationId,
          code: unit.code,
          nameAr: unit.nameAr,
          nameEn: unit.nameEn,
          symbolAr: unit.symbolAr,
          symbolEn: unit.symbolEn,
          category: unit.category,
          isDefault: unit.isDefault,
          sortOrder: unit.sortOrder,
          isActive: true,
        },
      });
    }
  }
}

router.use(authenticate);

// ─── 1. List Units of Measurement ───────────────────────────────
/**
 * GET /api/units
 * List units for the current organization.
 * Supports ?all=true to include inactive units (for management).
 */
router.get('/', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  await ensureStandardUnitsForOrg(organizationId);

  const showAll = req.query.all === 'true';
  const where: any = { organizationId };
  if (!showAll) {
    where.isActive = true;
  }

  const units = await prisma.unitOfMeasure.findMany({
    where,
    orderBy: [{ sortOrder: 'asc' }, { nameAr: 'asc' }],
    include: {
      _count: {
        select: { workItemTemplates: true },
      },
    },
  });

  res.json({ success: true, data: units });
});

// ─── 2. Get Single Unit ─────────────────────────────────────────
/**
 * GET /api/units/:id
 */
router.get('/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const unit = await prisma.unitOfMeasure.findFirst({
    where: { id: req.params.id, organizationId },
    include: {
      _count: {
        select: { workItemTemplates: true },
      },
    },
  });

  if (!unit) throw new NotFoundError('UnitOfMeasure');
  res.json({ success: true, data: unit });
});

// ─── 3. Create Unit of Measurement ──────────────────────────────
/**
 * POST /api/units
 */
router.post('/', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const {
    code,
    nameAr,
    nameEn,
    symbolAr,
    symbolEn,
    category,
    isDefault,
    isActive = true,
    sortOrder,
  } = req.body || {};

  if (!code || !String(code).trim()) {
    throw new ValidationError('رمز الوحدة إلزامي / Unit code is required');
  }
  if (!nameAr || !String(nameAr).trim()) {
    throw new ValidationError('اسم الوحدة بالعربية إلزامي / Arabic unit name is required');
  }
  if (!symbolAr || !String(symbolAr).trim()) {
    throw new ValidationError('رمز/اختصار الوحدة بالعربية إلزامي / Arabic unit symbol is required');
  }

  const cleanCode = String(code).trim().toUpperCase();
  const cleanNameAr = String(nameAr).trim();
  const cleanSymbolAr = String(symbolAr).trim();
  const cleanNameEn = nameEn && String(nameEn).trim() ? String(nameEn).trim() : cleanNameAr;
  const cleanSymbolEn = symbolEn && String(symbolEn).trim() ? String(symbolEn).trim() : cleanSymbolAr;

  // Check unique code and symbol within the org
  const existingCode = await prisma.unitOfMeasure.findFirst({
    where: { organizationId, code: cleanCode },
  });
  if (existingCode) {
    throw new ValidationError(`رمز الوحدة "${cleanCode}" مسجل مسبقاً في النظام / Unit code already exists`);
  }

  const existingSymbol = await prisma.unitOfMeasure.findFirst({
    where: { organizationId, symbolAr: cleanSymbolAr },
  });
  if (existingSymbol) {
    throw new ValidationError(`رمز الوحدة بالعربية "${cleanSymbolAr}" مسجل مسبقاً / Arabic unit symbol already exists`);
  }

  // Handle default flag
  if (isDefault) {
    await prisma.unitOfMeasure.updateMany({
      where: { organizationId, isDefault: true },
      data: { isDefault: false },
    });
  }

  const maxOrder =
    sortOrder !== undefined
      ? parseInt(String(sortOrder), 10)
      : (await prisma.unitOfMeasure.count({ where: { organizationId } })) + 1;

  const newUnit = await prisma.unitOfMeasure.create({
    data: {
      organizationId,
      code: cleanCode,
      nameAr: cleanNameAr,
      nameEn: cleanNameEn,
      symbolAr: cleanSymbolAr,
      symbolEn: cleanSymbolEn,
      category: category ? String(category).trim().toUpperCase() : null,
      isDefault: Boolean(isDefault),
      isActive: Boolean(isActive),
      sortOrder: isNaN(maxOrder) ? 0 : maxOrder,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'CREATE',
      entityType: 'UnitOfMeasure',
      entityId: newUnit.id,
      description: `Created unit of measure: ${newUnit.nameAr} (${newUnit.symbolAr} / ${newUnit.code})`,
      metadata: { code: newUnit.code, symbolAr: newUnit.symbolAr },
    },
  });

  res.status(201).json({ success: true, data: newUnit });
});

// ─── 4. Update Unit of Measurement ──────────────────────────────
/**
 * PUT /api/units/:id
 */
router.put('/:id', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;
  const { id } = req.params;

  const existing = await prisma.unitOfMeasure.findFirst({
    where: { id, organizationId },
  });
  if (!existing) throw new NotFoundError('UnitOfMeasure');

  const {
    nameAr,
    nameEn,
    symbolAr,
    symbolEn,
    category,
    isDefault,
    isActive,
    sortOrder,
  } = req.body || {};

  const cleanNameAr = nameAr !== undefined ? String(nameAr).trim() : existing.nameAr;
  const cleanSymbolAr = symbolAr !== undefined ? String(symbolAr).trim() : existing.symbolAr;
  const cleanNameEn = nameEn !== undefined ? (nameEn && String(nameEn).trim() ? String(nameEn).trim() : cleanNameAr) : existing.nameEn;
  const cleanSymbolEn = symbolEn !== undefined ? (symbolEn && String(symbolEn).trim() ? String(symbolEn).trim() : cleanSymbolAr) : existing.symbolEn;

  if (!cleanNameAr) {
    throw new ValidationError('اسم الوحدة بالعربية إلزامي / Arabic unit name is required');
  }
  if (!cleanSymbolAr) {
    throw new ValidationError('رمز الوحدة بالعربية إلزامي / Arabic unit symbol is required');
  }

  // Check unique symbol if changed
  if (cleanSymbolAr !== existing.symbolAr) {
    const dup = await prisma.unitOfMeasure.findFirst({
      where: { organizationId, symbolAr: cleanSymbolAr, id: { not: id } },
    });
    if (dup) {
      throw new ValidationError(`رمز الوحدة بالعربية "${cleanSymbolAr}" مسجل مسبقاً / Arabic unit symbol already exists`);
    }
  }

  if (isDefault && !existing.isDefault) {
    await prisma.unitOfMeasure.updateMany({
      where: { organizationId, isDefault: true, id: { not: id } },
      data: { isDefault: false },
    });
  }

  const updated = await prisma.unitOfMeasure.update({
    where: { id },
    data: {
      nameAr: cleanNameAr,
      nameEn: cleanNameEn,
      symbolAr: cleanSymbolAr,
      symbolEn: cleanSymbolEn,
      category: category !== undefined ? (category ? String(category).trim().toUpperCase() : null) : existing.category,
      isDefault: isDefault !== undefined ? Boolean(isDefault) : existing.isDefault,
      isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
      sortOrder: sortOrder !== undefined ? parseInt(String(sortOrder), 10) : existing.sortOrder,
    },
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'UPDATE',
      entityType: 'UnitOfMeasure',
      entityId: updated.id,
      description: `Updated unit of measure: ${updated.nameAr} (${updated.symbolAr})`,
      metadata: { code: updated.code, symbolAr: updated.symbolAr },
    },
  });

  res.json({ success: true, data: updated });
});

// ─── 5. Delete Unit of Measurement (Strict Reference Protection) ─
/**
 * DELETE /api/units/:id
 * Prevents deletion if referenced by existing work items, work entries, statements, or invoices.
 */
router.delete('/:id', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;
  const { id } = req.params;

  const unit = await prisma.unitOfMeasure.findFirst({
    where: { id, organizationId },
  });
  if (!unit) throw new NotFoundError('UnitOfMeasure');

  // Check usage across all business and financial records
  const [tmplCount, entryCount, stmtLineCount, invLineCount] = await Promise.all([
    prisma.workItemTemplate.count({
      where: {
        organizationId,
        OR: [{ unitOfMeasureId: id }, { unit: unit.symbolAr }, { unit: unit.nameAr }],
      },
    }),
    prisma.workEntry.count({
      where: {
        organizationId,
        OR: [{ unit: unit.symbolAr }, { unit: unit.nameAr }],
      },
    }),
    prisma.statementLine.count({
      where: {
        statement: { organizationId },
        OR: [{ unit: unit.symbolAr }, { unit: unit.nameAr }],
      },
    }),
    prisma.invoiceLine.count({
      where: {
        invoice: { organizationId },
        OR: [{ unit: unit.symbolAr }, { unit: unit.nameAr }],
      },
    }),
  ]);

  const totalReferences = tmplCount + entryCount + stmtLineCount + invLineCount;
  if (totalReferences > 0) {
    throw new BusinessRuleError(
      `لا يمكن حذف وحدة القياس "${unit.nameAr}" (${unit.symbolAr}) نظراً لوجود ${totalReferences} سجل مرتبط بها في بنود الأعمال أو المستخلصات أو الفواتير. لحماية السجلات التاريخية، يمكنك إلغاء تنشيط الوحدة بدلاً من حذفها.`
    );
  }

  await prisma.unitOfMeasure.delete({ where: { id } });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'DELETE',
      entityType: 'UnitOfMeasure',
      entityId: id,
      description: `Deleted unused unit of measure: ${unit.nameAr} (${unit.symbolAr} / ${unit.code})`,
      metadata: { code: unit.code, symbolAr: unit.symbolAr },
    },
  });

  res.json({
    success: true,
    message: `تم حذف وحدة القياس "${unit.nameAr}" بنجاح`,
  });
});

export default router;
