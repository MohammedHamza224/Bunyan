import { Router, Response } from 'express';
import path from 'path';
import fs from 'fs';
import multer from 'multer';
import { prisma } from '../lib/prisma';
import { config } from '../config';
import {
  authenticate,
  requirePermission,
  PERMISSIONS,
  resolveUserPermissions,
  DEFAULT_ROLE_PERMISSIONS,
  ALL_PERMISSIONS,
  AuthenticatedRequest,
  assertSameOrg,
} from '../middleware/auth';
import { NotFoundError, ValidationError, AuthorizationError, BusinessRuleError, ConflictError } from '../middleware/errorHandler';
import { Prisma, UserRole } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { zatcaService } from '../services/zatcaService';

const router = Router();

// All routes require authentication
router.use(authenticate);

// ─── Org Settings ──────────────────────────────────────────────

/**
 * GET /api/organizations/settings
 * Get the org settings for the authenticated user's organization.
 */
router.get('/settings', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  let settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });

  if (!settings) {
    settings = await prisma.orgSettings.create({
      data: {
        organizationId,
        defaultCurrency: 'SAR',
        defaultLanguage: 'ar',
      },
    });
  }

  res.json({ success: true, data: settings });
});

/**
 * PUT /api/organizations/settings
 * Update org settings. Requires MANAGE_SETTINGS permission.
 */
router.put(
  '/settings',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    // Strip immutable / relational fields from body
    const {
      id: _id,
      organizationId: _orgId,
      createdAt: _createdAt,
      updatedAt: _updatedAt,
      organization: _organization,
      commercialRegNo,
      ...updateData
    } = req.body;

    if (commercialRegNo !== undefined && updateData.commercialReg === undefined) {
      updateData.commercialReg = commercialRegNo;
    }

    // Validate vatRate if provided
    if (updateData.vatRate !== undefined) {
      const rate = Number(updateData.vatRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new ValidationError('Invalid VAT rate');
      }
    }

    // Validate website if provided
    if (updateData.website !== undefined && updateData.website !== null) {
      const trimmedWebsite = String(updateData.website).trim();
      if (trimmedWebsite === '') {
        updateData.website = null;
      } else {
        try {
          const parsedUrl = new URL(trimmedWebsite);
          if (!['http:', 'https:'].includes(parsedUrl.protocol)) {
            throw new Error();
          }
          updateData.website = trimmedWebsite;
        } catch {
          throw new ValidationError(
            'الرجاء إدخال رابط موقع إلكتروني صالح يبدأ بـ http:// أو https:// (Please enter a valid website URL starting with http:// or https://)'
          );
        }
      }
    }

    const settings = await prisma.$transaction(async (tx) => {
      const updated = await tx.orgSettings.upsert({
        where: { organizationId },
        update: updateData,
        create: { organizationId, ...updateData },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SETTINGS_UPDATE',
          entityType: 'OrgSettings',
          entityId: updated.id,
          description: 'Organization settings updated',
          metadata: { updatedFields: Object.keys(updateData) },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updated;
    });

    res.json({ success: true, data: settings });
  }
);

// ─── Company Logo Upload & Removal ─────────────────────────────

const logoUploadDir = path.resolve(config.uploadDir);
if (!fs.existsSync(logoUploadDir)) {
  fs.mkdirSync(logoUploadDir, { recursive: true });
}

const logoStorage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, logoUploadDir);
  },
  filename: (req, file, cb) => {
    const authReq = req as unknown as AuthenticatedRequest;
    const orgId = authReq.user?.organizationId || 'org';
    const ext = path.extname(file.originalname).toLowerCase();
    const safeExt = ['.png', '.jpg', '.jpeg', '.webp'].includes(ext) ? ext : '.png';
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `logo-${orgId}-${uniqueSuffix}${safeExt}`);
  },
});

const logoUpload = multer({
  storage: logoStorage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (_req, file, cb) => {
    const allowedMimeTypes = ['image/png', 'image/jpeg', 'image/webp'];
    if (allowedMimeTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new ValidationError('Invalid file type. Only PNG, JPG/JPEG, and WebP images are allowed.'));
    }
  },
});

/**
 * POST /api/organizations/logo
 * Upload and persist company logo.
 */
router.post(
  '/logo',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  (req, res, next) => {
    (logoUpload.single('logo') as any)(req, res, (err: any) => {
      if (err) {
        if (err.name === 'MulterError' && (err as any).code === 'LIMIT_FILE_SIZE') {
          return next(new ValidationError('File size exceeds the 5MB limit. Please choose an image smaller than 5MB.'));
        }
        return next(err);
      }
      next();
    });
  },
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    if (!req.file) {
      throw new ValidationError('No image file provided.');
    }

    const logoUrl = `/uploads/${req.file.filename}`;

    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.orgSettings.findUnique({
        where: { organizationId },
      });

      // Safely delete previous local logo file if exists
      if (existing?.logoUrl && existing.logoUrl.startsWith('/uploads/logo-')) {
        const oldFile = path.basename(existing.logoUrl);
        const oldPath = path.join(logoUploadDir, oldFile);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch {
            // Ignore unlink errors
          }
        }
      }

      const updated = await tx.orgSettings.upsert({
        where: { organizationId },
        update: { logoUrl },
        create: {
          organizationId,
          logoUrl,
          defaultCurrency: 'SAR',
          defaultLanguage: 'ar',
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SETTINGS_UPDATE',
          entityType: 'OrgSettings',
          entityId: updated.id,
          description: 'Company logo uploaded and updated',
          metadata: {
            logoUrl,
            originalName: req.file?.originalname,
            size: req.file?.size,
            mimeType: req.file?.mimetype,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updated;
    });

    res.json({
      success: true,
      data: {
        logoUrl,
        settings,
      },
    });
  }
);

/**
 * DELETE /api/organizations/logo
 * Remove company logo.
 */
router.delete(
  '/logo',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const settings = await prisma.$transaction(async (tx) => {
      const existing = await tx.orgSettings.findUnique({
        where: { organizationId },
      });

      if (existing?.logoUrl && existing.logoUrl.startsWith('/uploads/logo-')) {
        const oldFile = path.basename(existing.logoUrl);
        const oldPath = path.join(logoUploadDir, oldFile);
        if (fs.existsSync(oldPath)) {
          try {
            fs.unlinkSync(oldPath);
          } catch {
            // Ignore unlink errors
          }
        }
      }

      const updated = await tx.orgSettings.upsert({
        where: { organizationId },
        update: { logoUrl: null },
        create: {
          organizationId,
          logoUrl: null,
          defaultCurrency: 'SAR',
          defaultLanguage: 'ar',
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'SETTINGS_UPDATE',
          entityType: 'OrgSettings',
          entityId: updated.id,
          description: 'Company logo removed',
          metadata: {
            previousLogoUrl: existing?.logoUrl,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updated;
    });

    res.json({
      success: true,
      data: {
        logoUrl: null,
        settings,
      },
    });
  }
);

// ─── Multi-Country Settings ──────────────────────────────────────

/**
 * GET /api/organizations/countries
 * Get all configured countries for the organization.
 * Automatically initializes Saudi Arabia default if no countries exist yet.
 */
router.get('/countries', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  let countries = await prisma.orgCountry.findMany({
    where: { organizationId },
    orderBy: [{ isDefault: 'desc' }, { countryCode: 'asc' }],
  });

  // Auto-seed initial default country from existing OrgSettings if empty
  if (countries.length === 0) {
    const settings = await prisma.orgSettings.findUnique({
      where: { organizationId },
    });

    const defaultCountry = await prisma.orgCountry.create({
      data: {
        organizationId,
        countryCode: (settings?.country || 'SA').toUpperCase(),
        nameAr: 'المملكة العربية السعودية',
        nameEn: 'Saudi Arabia',
        isDefault: true,
        isActive: true,
        currencyCode: settings?.defaultCurrency || 'SAR',
        currencyNameAr: 'ريال سعودي',
        currencyNameEn: 'Saudi Riyal',
        currencySymbol: 'ر.س',
        taxNumber: settings?.vatNumber || null,
        taxNumberLabelAr: 'الرقم الضريبي',
        taxNumberLabelEn: 'Tax Identification Number (VAT)',
        standardTaxRate: settings?.vatRate ?? 15,
        commercialReg: settings?.commercialReg || null,
        commercialRegLabelAr: 'السجل التجاري',
        commercialRegLabelEn: 'Commercial Registration',
        timezone: 'Asia/Riyadh',
        dateFormat: settings?.dateFormat || 'DD/MM/YYYY',
        phoneCode: '+966',
        electronicInvoicingStatus: 'ZATCA_PHASE_2',
        notes: 'التهيئة الأساسية المعتمدة للمملكة العربية السعودية وفق اشتراطات هيئة الزكاة والضريبة والجمارك (ZATCA)',
      },
    });

    countries = [defaultCountry];
  }

  res.json({ success: true, data: countries });
});

/**
 * POST /api/organizations/countries
 * Add a new country configuration. Requires MANAGE_SETTINGS permission.
 */
router.post(
  '/countries',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;

    const {
      countryCode,
      nameAr,
      nameEn,
      currencyCode,
      currencyNameAr,
      currencyNameEn,
      currencySymbol,
      taxNumber,
      taxNumberLabelAr,
      taxNumberLabelEn,
      standardTaxRate,
      commercialReg,
      commercialRegLabelAr,
      commercialRegLabelEn,
      timezone,
      dateFormat,
      phoneCode,
      electronicInvoicingStatus,
      notes,
      isDefault,
      isActive,
    } = req.body || {};

    if (!countryCode || typeof countryCode !== 'string' || countryCode.trim().length !== 2) {
      throw new ValidationError('Valid ISO 3166-1 alpha-2 country code is required (e.g. SA, AE, KW)');
    }

    if (!nameAr || !nameEn) {
      throw new ValidationError('Both Arabic and English country names are required');
    }

    if (!currencyCode || typeof currencyCode !== 'string' || currencyCode.trim().length !== 3) {
      throw new ValidationError('Valid ISO 4217 currency code is required (e.g. SAR, AED, USD)');
    }

    const cleanCode = countryCode.trim().toUpperCase();
    const cleanCurrency = currencyCode.trim().toUpperCase();

    // Prevent duplicate country code for this organization
    const existing = await prisma.orgCountry.findUnique({
      where: {
        organizationId_countryCode: {
          organizationId,
          countryCode: cleanCode,
        },
      },
    });

    if (existing) {
      throw new ConflictError(`Country "${cleanCode}" is already configured for this organization`);
    }

    const rate = standardTaxRate !== undefined ? Number(standardTaxRate) : 0;
    if (isNaN(rate) || rate < 0 || rate > 100) {
      throw new ValidationError('Standard tax rate must be a number between 0 and 100');
    }

    const newCountry = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.orgCountry.updateMany({
          where: { organizationId },
          data: { isDefault: false },
        });
      }

      const created = await tx.orgCountry.create({
        data: {
          organizationId,
          countryCode: cleanCode,
          nameAr: nameAr.trim(),
          nameEn: nameEn.trim(),
          isDefault: Boolean(isDefault),
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          currencyCode: cleanCurrency,
          currencyNameAr: (currencyNameAr || cleanCurrency).trim(),
          currencyNameEn: (currencyNameEn || cleanCurrency).trim(),
          currencySymbol: (currencySymbol || cleanCurrency).trim(),
          taxNumber: taxNumber ? String(taxNumber).trim() : null,
          taxNumberLabelAr: (taxNumberLabelAr || 'الرقم الضريبي').trim(),
          taxNumberLabelEn: (taxNumberLabelEn || 'Tax Identification Number').trim(),
          standardTaxRate: rate,
          commercialReg: commercialReg ? String(commercialReg).trim() : null,
          commercialRegLabelAr: (commercialRegLabelAr || 'السجل التجاري').trim(),
          commercialRegLabelEn: (commercialRegLabelEn || 'Commercial Registration').trim(),
          timezone: (timezone || 'Asia/Riyadh').trim(),
          dateFormat: (dateFormat || 'DD/MM/YYYY').trim(),
          phoneCode: phoneCode ? String(phoneCode).trim() : null,
          electronicInvoicingStatus: (electronicInvoicingStatus || 'STANDARD').trim(),
          notes: notes ? String(notes).trim() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CREATE',
          entityType: 'OrgCountry',
          entityId: created.id,
          description: `Country configuration added: ${created.nameAr} (${created.countryCode})`,
          metadata: { countryCode: created.countryCode, currency: created.currencyCode, taxRate: rate },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return created;
    });

    res.status(201).json({ success: true, data: newCountry });
  }
);

/**
 * PUT /api/organizations/countries/:id
 * Update country configuration. Requires MANAGE_SETTINGS permission.
 */
router.put(
  '/countries/:id',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgCountry.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Country configuration not found');
    }

    const {
      nameAr,
      nameEn,
      currencyCode,
      currencyNameAr,
      currencyNameEn,
      currencySymbol,
      taxNumber,
      taxNumberLabelAr,
      taxNumberLabelEn,
      standardTaxRate,
      commercialReg,
      commercialRegLabelAr,
      commercialRegLabelEn,
      timezone,
      dateFormat,
      phoneCode,
      electronicInvoicingStatus,
      notes,
      isDefault,
      isActive,
    } = req.body || {};

    if (isActive === false && existing.isDefault) {
      throw new BusinessRuleError('Cannot deactivate the default country. Assign another country as default first.');
    }

    if (standardTaxRate !== undefined) {
      const rate = Number(standardTaxRate);
      if (isNaN(rate) || rate < 0 || rate > 100) {
        throw new ValidationError('Standard tax rate must be a number between 0 and 100');
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (isDefault) {
        await tx.orgCountry.updateMany({
          where: { organizationId, id: { not: id } },
          data: { isDefault: false },
        });
      }

      const updatedRecord = await tx.orgCountry.update({
        where: { id },
        data: {
          ...(nameAr ? { nameAr: nameAr.trim() } : {}),
          ...(nameEn ? { nameEn: nameEn.trim() } : {}),
          ...(currencyCode ? { currencyCode: currencyCode.trim().toUpperCase() } : {}),
          ...(currencyNameAr !== undefined ? { currencyNameAr: currencyNameAr.trim() } : {}),
          ...(currencyNameEn !== undefined ? { currencyNameEn: currencyNameEn.trim() } : {}),
          ...(currencySymbol !== undefined ? { currencySymbol: currencySymbol.trim() } : {}),
          ...(taxNumber !== undefined ? { taxNumber: taxNumber ? String(taxNumber).trim() : null } : {}),
          ...(taxNumberLabelAr !== undefined ? { taxNumberLabelAr: taxNumberLabelAr.trim() } : {}),
          ...(taxNumberLabelEn !== undefined ? { taxNumberLabelEn: taxNumberLabelEn.trim() } : {}),
          ...(standardTaxRate !== undefined ? { standardTaxRate: Number(standardTaxRate) } : {}),
          ...(commercialReg !== undefined ? { commercialReg: commercialReg ? String(commercialReg).trim() : null } : {}),
          ...(commercialRegLabelAr !== undefined ? { commercialRegLabelAr: commercialRegLabelAr.trim() } : {}),
          ...(commercialRegLabelEn !== undefined ? { commercialRegLabelEn: commercialRegLabelEn.trim() } : {}),
          ...(timezone !== undefined ? { timezone: timezone.trim() } : {}),
          ...(dateFormat !== undefined ? { dateFormat: dateFormat.trim() } : {}),
          ...(phoneCode !== undefined ? { phoneCode: phoneCode ? String(phoneCode).trim() : null } : {}),
          ...(electronicInvoicingStatus !== undefined ? { electronicInvoicingStatus: electronicInvoicingStatus.trim() } : {}),
          ...(notes !== undefined ? { notes: notes ? String(notes).trim() : null } : {}),
          ...(isDefault !== undefined ? { isDefault: Boolean(isDefault) } : {}),
          ...(isActive !== undefined ? { isActive: Boolean(isActive) } : {}),
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'OrgCountry',
          entityId: id,
          description: `Country configuration updated: ${updatedRecord.nameAr} (${updatedRecord.countryCode})`,
          metadata: { isDefault: updatedRecord.isDefault, isActive: updatedRecord.isActive },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updatedRecord;
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * PUT /api/organizations/countries/:id/set-default
 * Quick action to set a country as default. Requires MANAGE_SETTINGS permission.
 */
router.put(
  '/countries/:id/set-default',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgCountry.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Country configuration not found');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orgCountry.updateMany({
        where: { organizationId },
        data: { isDefault: false },
      });

      const updatedRecord = await tx.orgCountry.update({
        where: { id },
        data: { isDefault: true, isActive: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'OrgCountry',
          entityId: id,
          description: `Designated default country: ${updatedRecord.nameAr} (${updatedRecord.countryCode})`,
          metadata: { countryCode: updatedRecord.countryCode, isDefault: true },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return updatedRecord;
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * DELETE /api/organizations/countries/:id
 * Remove country configuration. Cannot delete default country.
 */
router.delete(
  '/countries/:id',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgCountry.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError('Country configuration not found');
    }

    if (existing.isDefault) {
      throw new BusinessRuleError('Cannot delete the active default country configuration');
    }

    await prisma.$transaction(async (tx) => {
      await tx.orgCountry.delete({ where: { id } });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'OrgCountry',
          entityId: id,
          description: `Removed country configuration: ${existing.nameAr} (${existing.countryCode})`,
          metadata: { countryCode: existing.countryCode },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({ success: true, message: 'Country configuration removed successfully' });
  }
);

// ─── Company Receiving Bank Accounts ───────────────────────────

/**
 * GET /api/organizations/bank-accounts
 * List all company receiving bank accounts.
 */
router.get(
  '/bank-accounts',
  requirePermission(PERMISSIONS.VIEW_DATA),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId } = authReq.user;
    const activeOnly = req.query.activeOnly === 'true';

    const where: Prisma.OrgBankAccountWhereInput = { organizationId };
    if (activeOnly) {
      where.isActive = true;
    }

    const accounts = await prisma.orgBankAccount.findMany({
      where,
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'asc' }],
    });

    res.json({ success: true, data: accounts });
  }
);

/**
 * POST /api/organizations/bank-accounts
 * Add a new company receiving bank account.
 */
router.post(
  '/bank-accounts',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;

    const {
      bankNameAr,
      bankNameEn,
      beneficiaryNameAr,
      beneficiaryNameEn,
      iban,
      accountNumber,
      currency,
      branch,
      swiftCode,
      isDefault,
      isActive,
      notes,
    } = req.body || {};

    if (!bankNameAr || !String(bankNameAr).trim()) {
      throw new ValidationError('اسم البنك بالعربية مطلوب / Bank name in Arabic is required');
    }
    if (!bankNameEn || !String(bankNameEn).trim()) {
      throw new ValidationError('Bank name in English is required');
    }
    if (!beneficiaryNameAr || !String(beneficiaryNameAr).trim()) {
      throw new ValidationError('اسم المستفيد بالعربية مطلوب / Beneficiary name in Arabic is required');
    }
    if (!beneficiaryNameEn || !String(beneficiaryNameEn).trim()) {
      throw new ValidationError('Beneficiary name in English is required');
    }

    const rawIban = String(iban || '').replace(/\s+/g, '').toUpperCase();
    if (!rawIban || rawIban.length < 15 || rawIban.length > 34) {
      throw new ValidationError('رقم الآيبان غير صحيح / Invalid IBAN format');
    }

    // Check duplicate IBAN in same organization
    const existing = await prisma.orgBankAccount.findFirst({
      where: { organizationId, iban: rawIban },
    });
    if (existing) {
      throw new ConflictError('رقم الآيبان هذا مسجل مسبقاً في المؤسسة / This IBAN is already registered');
    }

    const existingCount = await prisma.orgBankAccount.count({ where: { organizationId } });
    const shouldBeDefault = Boolean(isDefault) || existingCount === 0;

    const newAccount = await prisma.$transaction(async (tx) => {
      if (shouldBeDefault) {
        await tx.orgBankAccount.updateMany({
          where: { organizationId, isDefault: true },
          data: { isDefault: false },
        });
      }

      const account = await tx.orgBankAccount.create({
        data: {
          organizationId,
          bankNameAr: String(bankNameAr).trim(),
          bankNameEn: String(bankNameEn).trim(),
          beneficiaryNameAr: String(beneficiaryNameAr).trim(),
          beneficiaryNameEn: String(beneficiaryNameEn).trim(),
          iban: rawIban,
          accountNumber: accountNumber ? String(accountNumber).trim() : null,
          currency: currency ? String(currency).trim().toUpperCase() : 'SAR',
          branch: branch ? String(branch).trim() : null,
          swiftCode: swiftCode ? String(swiftCode).trim().toUpperCase() : null,
          isDefault: shouldBeDefault,
          isActive: isActive !== undefined ? Boolean(isActive) : true,
          notes: notes ? String(notes).trim() : null,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CREATE',
          entityType: 'OrgBankAccount',
          entityId: account.id,
          description: `Added receiving bank account: ${account.bankNameAr} (${account.iban})`,
          metadata: {
            bankNameAr: account.bankNameAr,
            bankNameEn: account.bankNameEn,
            iban: account.iban,
            isDefault: account.isDefault,
            createdBy: email,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return account;
    });

    res.status(201).json({ success: true, data: newAccount });
  }
);

/**
 * PUT /api/organizations/bank-accounts/:id
 * Update an existing company receiving bank account.
 */
router.put(
  '/bank-accounts/:id',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgBankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError('OrgBankAccount');

    const {
      bankNameAr,
      bankNameEn,
      beneficiaryNameAr,
      beneficiaryNameEn,
      iban,
      accountNumber,
      currency,
      branch,
      swiftCode,
      isDefault,
      isActive,
      notes,
    } = req.body || {};

    let rawIban = existing.iban;
    if (iban !== undefined) {
      rawIban = String(iban).replace(/\s+/g, '').toUpperCase();
      if (!rawIban || rawIban.length < 15 || rawIban.length > 34) {
        throw new ValidationError('رقم الآيبان غير صحيح / Invalid IBAN format');
      }
      if (rawIban !== existing.iban) {
        const duplicate = await prisma.orgBankAccount.findFirst({
          where: { organizationId, iban: rawIban, id: { not: id } },
        });
        if (duplicate) {
          throw new ConflictError('رقم الآيبان هذا مسجل لحساب آخر / This IBAN is already registered to another account');
        }
      }
    }

    const updated = await prisma.$transaction(async (tx) => {
      const willBeDefault = isDefault === true;
      if (willBeDefault) {
        await tx.orgBankAccount.updateMany({
          where: { organizationId, id: { not: id }, isDefault: true },
          data: { isDefault: false },
        });
      }

      const account = await tx.orgBankAccount.update({
        where: { id },
        data: {
          bankNameAr: bankNameAr !== undefined ? String(bankNameAr).trim() : existing.bankNameAr,
          bankNameEn: bankNameEn !== undefined ? String(bankNameEn).trim() : existing.bankNameEn,
          beneficiaryNameAr: beneficiaryNameAr !== undefined ? String(beneficiaryNameAr).trim() : existing.beneficiaryNameAr,
          beneficiaryNameEn: beneficiaryNameEn !== undefined ? String(beneficiaryNameEn).trim() : existing.beneficiaryNameEn,
          iban: rawIban,
          accountNumber: accountNumber !== undefined ? (accountNumber ? String(accountNumber).trim() : null) : existing.accountNumber,
          currency: currency !== undefined ? String(currency).trim().toUpperCase() : existing.currency,
          branch: branch !== undefined ? (branch ? String(branch).trim() : null) : existing.branch,
          swiftCode: swiftCode !== undefined ? (swiftCode ? String(swiftCode).trim().toUpperCase() : null) : existing.swiftCode,
          isDefault: willBeDefault ? true : (isDefault !== undefined ? Boolean(isDefault) : existing.isDefault),
          isActive: isActive !== undefined ? Boolean(isActive) : existing.isActive,
          notes: notes !== undefined ? (notes ? String(notes).trim() : null) : existing.notes,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'OrgBankAccount',
          entityId: account.id,
          description: `Updated receiving bank account: ${account.bankNameAr} (${account.iban})`,
          metadata: {
            bankNameAr: account.bankNameAr,
            iban: account.iban,
            isDefault: account.isDefault,
            isActive: account.isActive,
            updatedBy: email,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return account;
    });

    res.json({ success: true, data: updated });
  }
);

/**
 * PUT /api/organizations/bank-accounts/:id/set-default
 * Mark bank account as default receiving bank account.
 */
router.put(
  '/bank-accounts/:id/set-default',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgBankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError('OrgBankAccount');

    if (!existing.isActive) {
      throw new BusinessRuleError('لا يمكن تعيين حساب غير مفعّل كحساب رئيسي / Inactive account cannot be set as default');
    }

    const updated = await prisma.$transaction(async (tx) => {
      await tx.orgBankAccount.updateMany({
        where: { organizationId, id: { not: id }, isDefault: true },
        data: { isDefault: false },
      });

      const account = await tx.orgBankAccount.update({
        where: { id },
        data: { isDefault: true },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'UPDATE',
          entityType: 'OrgBankAccount',
          entityId: account.id,
          description: `Set default receiving bank account to: ${account.bankNameAr} (${account.iban})`,
          metadata: { bankId: id, iban: account.iban, updatedBy: email },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return account;
    });

    res.json({ success: true, data: updated, message: 'Default bank account updated successfully' });
  }
);

/**
 * DELETE /api/organizations/bank-accounts/:id
 * Delete a company receiving bank account (if no historical payments reference it).
 */
router.delete(
  '/bank-accounts/:id',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: userId, email } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.orgBankAccount.findFirst({
      where: { id, organizationId },
    });
    if (!existing) throw new NotFoundError('OrgBankAccount');

    // Protect historical financial records
    const linkedPaymentsCount = await prisma.payment.count({
      where: { bankAccountId: id },
    });

    if (linkedPaymentsCount > 0) {
      throw new BusinessRuleError(
        `لا يمكن حذف هذا الحساب البنكي لوجود ${linkedPaymentsCount} دفعة مسجلة مرتبطة به. يرجى إلغاء تفعيله بدلاً من حذفه للحفاظ على السجل المالي التاريخي.`
      );
    }

    await prisma.$transaction(async (tx) => {
      await tx.orgBankAccount.delete({ where: { id } });

      // If the deleted account was the default, make another active account default if one exists
      if (existing.isDefault) {
        const nextAccount = await tx.orgBankAccount.findFirst({
          where: { organizationId, isActive: true },
          orderBy: { createdAt: 'asc' },
        });
        if (nextAccount) {
          await tx.orgBankAccount.update({
            where: { id: nextAccount.id },
            data: { isDefault: true },
          });
        }
      }

      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'OrgBankAccount',
          entityId: id,
          description: `Deleted receiving bank account: ${existing.bankNameAr} (${existing.iban})`,
          metadata: { iban: existing.iban, deletedBy: email },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({ success: true, message: 'Bank account deleted successfully' });
  }
);

// ─── Org Users & Permissions ────────────────────────────────────

/**
 * GET /api/organizations/permissions-catalog
 * Returns available granular permissions and default role mappings.
 */
router.get('/permissions-catalog', (_req, res: Response) => {
  res.json({
    success: true,
    data: {
      permissions: ALL_PERMISSIONS,
      roleDefaults: DEFAULT_ROLE_PERMISSIONS,
    },
  });
});

/**
 * GET /api/organizations/users
 * List all users in the organization.
 */
router.get('/users', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const users = await prisma.user.findMany({
    where: { organizationId },
    select: {
      id: true,
      email: true,
      nameAr: true,
      nameEn: true,
      role: true,
      permissions: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
    orderBy: { createdAt: 'asc' },
  });

  const enriched = users.map((u) => ({
    ...u,
    effectivePermissions: resolveUserPermissions(u.role, u.permissions),
  }));

  res.json({ success: true, data: enriched });
});

/**
 * GET /api/organizations/users/:id
 * Retrieve details for a specific user in the organization.
 */
router.get('/users/:id', requirePermission(PERMISSIONS.VIEW_DATA), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: requesterId, permissions } = authReq.user;
  const { id } = req.params;

  const canManageSettings = permissions.includes(PERMISSIONS.MANAGE_SETTINGS);
  if (!canManageSettings && id !== requesterId) {
    throw new AuthorizationError('You do not have permission to view other users');
  }

  const user = await prisma.user.findUnique({
    where: { id },
    select: {
      id: true,
      organizationId: true,
      email: true,
      nameAr: true,
      nameEn: true,
      role: true,
      permissions: true,
      isActive: true,
      lastLoginAt: true,
      createdAt: true,
      updatedAt: true,
    },
  });

  if (!user) {
    throw new NotFoundError('User');
  }
  assertSameOrg(organizationId, user.organizationId, 'User');

  res.json({
    success: true,
    data: {
      id: user.id,
      email: user.email,
      nameAr: user.nameAr,
      nameEn: user.nameEn,
      role: user.role,
      permissions: user.permissions,
      isActive: user.isActive,
      lastLoginAt: user.lastLoginAt,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
      effectivePermissions: resolveUserPermissions(user.role, user.permissions),
    },
  });
});

/**
 * POST /api/organizations/users
 * Create a new user in the organization. Requires MANAGE_SETTINGS permission.
 */
router.post(
  '/users',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: creatorId } = authReq.user;
    const { email, password, nameAr, nameEn, role, permissions } = req.body;

    if (!email || !password || !nameAr) {
      throw new ValidationError('email, password, and nameAr are required');
    }

    if (String(password).length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }

    const normalizedEmail = String(email).toLowerCase().trim();
    const existing = await prisma.user.findUnique({
      where: { organizationId_email: { organizationId, email: normalizedEmail } },
    });
    if (existing) {
      throw new ValidationError('A user with this email already exists in your organization');
    }

    const assignedRole: UserRole = role && Object.values(UserRole).includes(role)
      ? role
      : UserRole.ORG_STAFF;

    const assignedPermissions: string[] = Array.isArray(permissions) && permissions.length > 0
      ? permissions.filter((p: string) => ALL_PERMISSIONS.includes(p as any))
      : DEFAULT_ROLE_PERMISSIONS[assignedRole];

    const passwordHash = await bcrypt.hash(password, 12);

    const user = await prisma.$transaction(async (tx) => {
      const created = await tx.user.create({
        data: {
          organizationId,
          email: normalizedEmail,
          passwordHash,
          nameAr: String(nameAr).trim(),
          nameEn: nameEn ? String(nameEn).trim() : null,
          role: assignedRole,
          permissions: assignedPermissions,
        },
        select: {
          id: true,
          email: true,
          nameAr: true,
          nameEn: true,
          role: true,
          permissions: true,
          isActive: true,
          createdAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: creatorId,
          action: 'USER_MANAGE',
          entityType: 'User',
          entityId: created.id,
          description: `Created user ${created.email} with role ${created.role}`,
          metadata: { role: created.role, permissions: created.permissions },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return created;
    });

    res.status(201).json({
      success: true,
      data: {
        ...user,
        effectivePermissions: resolveUserPermissions(user.role, user.permissions),
      },
    });
  }
);

/**
 * PUT /api/organizations/users/:id
 * Update a user's details, role, or granular permissions.
 */
router.put('/users/:id', async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, permissions: requesterPerms, id: requesterId } = authReq.user;
  const { id } = req.params;

  const canManageSettings = requesterPerms.includes(PERMISSIONS.MANAGE_SETTINGS);

  if (!canManageSettings && id !== requesterId) {
    throw new AuthorizationError('You do not have permission to update other users');
  }

  const existing = await prisma.user.findUnique({
    where: { id },
  });

  if (!existing) {
    throw new NotFoundError('User');
  }
  assertSameOrg(organizationId, existing.organizationId, 'User');

  const {
    password,
    email,
    nameAr,
    nameEn,
    role,
    permissions,
    isActive,
    passwordHash: _ph,
    organizationId: _oid,
    id: _id,
    createdAt: _ca,
    updatedAt: _ua,
    ...updateData
  } = req.body;

  const data: Record<string, unknown> = { ...updateData };

  // Validate and handle nameAr
  if (nameAr !== undefined) {
    const trimmedAr = String(nameAr).trim();
    if (!trimmedAr) {
      throw new ValidationError('Arabic name (nameAr) is required / الاسم الكامل بالعربية مطلوب');
    }
    data.nameAr = trimmedAr;
  }

  // Handle nameEn
  if (nameEn !== undefined) {
    data.nameEn = nameEn ? String(nameEn).trim() : null;
  }

  // Handle password update if provided
  if (password) {
    if (String(password).length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  // Handle email update and validate uniqueness
  if (email !== undefined) {
    const normalizedEmail = String(email).toLowerCase().trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(normalizedEmail)) {
      throw new ValidationError('Invalid email format / صيغة البريد الإلكتروني غير صحيحة');
    }

    if (normalizedEmail !== existing.email) {
      const duplicate = await prisma.user.findFirst({
        where: {
          organizationId,
          email: normalizedEmail,
          id: { not: id },
        },
      });
      if (duplicate) {
        throw new ValidationError('A user with this email already exists in your organization / يوجد مستخدم آخر بهذا البريد الإلكتروني في المؤسسة');
      }
      data.email = normalizedEmail;
    }
  }

  // Only users with MANAGE_SETTINGS can change roles, permissions, or active status
  if (!canManageSettings) {
    delete data.role;
    delete data.permissions;
    delete data.isActive;
  } else {
    // Validate role if specified
    if (role !== undefined) {
      if (Object.values(UserRole).includes(role)) {
        // Self-protection: Administrator cannot remove their own admin role
        if (id === requesterId && existing.role === UserRole.ORG_ADMIN && role !== UserRole.ORG_ADMIN) {
          throw new ValidationError('You cannot remove your own administrative role / لا يمكنك إلغاء دورك الإداري بنفسك');
        }
        data.role = role;
      } else {
        throw new ValidationError('Invalid user role');
      }
    }

    // Filter permissions to valid set
    if (Array.isArray(permissions)) {
      data.permissions = (permissions as string[]).filter((p) =>
        ALL_PERMISSIONS.includes(p as any)
      );
    }

    // Handle isActive toggle
    if (isActive !== undefined) {
      const activeBool = Boolean(isActive);
      // Self-protection: Administrator cannot deactivate their own account
      if (id === requesterId && !activeBool) {
        throw new ValidationError('You cannot deactivate your own account / لا يمكنك تعطيل حسابك بنفسك');
      }
      data.isActive = activeBool;
    }
  }

  const updated = await prisma.$transaction(async (tx) => {
    const u = await tx.user.update({
      where: { id },
      data,
      select: {
        id: true,
        email: true,
        nameAr: true,
        nameEn: true,
        role: true,
        permissions: true,
        isActive: true,
        updatedAt: true,
      },
    });

    // If account was deactivated, revoke all active refresh tokens immediately
    if (data.isActive === false) {
      await tx.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });
    }

    await tx.auditLog.create({
      data: {
        organizationId,
        userId: requesterId,
        action: 'USER_MANAGE',
        entityType: 'User',
        entityId: u.id,
        description: `Updated user ${u.email}`,
        metadata: { updatedFields: Object.keys(data).filter((k) => k !== 'passwordHash') },
        ipAddress: req.ip || req.socket.remoteAddress,
      },
    });

    return u;
  });

  res.json({
    success: true,
    data: {
      ...updated,
      effectivePermissions: resolveUserPermissions(updated.role, updated.permissions),
    },
  });
});

/**
 * POST /api/organizations/users/:id/reset-password
 * Dedicated administrative password reset for a user in the organization.
 * Requires MANAGE_SETTINGS permission.
 */
router.post(
  '/users/:id/reset-password',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: requesterId } = authReq.user;
    const { id } = req.params;
    const { newPassword, password, confirmPassword } = req.body;

    const pwdToSet = newPassword || password;
    if (!pwdToSet) {
      throw new ValidationError('New password is required / كلمة المرور الجديدة مطلوبة');
    }

    if (String(pwdToSet).length < 8) {
      throw new ValidationError('Password must be at least 8 characters / يجب أن تتكون كلمة المرور من 8 أحرف على الأقل');
    }

    if (confirmPassword && confirmPassword !== pwdToSet) {
      throw new ValidationError('Passwords do not match / كلمتا المرور غير متطابقتين');
    }

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('User');
    }
    assertSameOrg(organizationId, existing.organizationId, 'User');

    const passwordHash = await bcrypt.hash(String(pwdToSet), 12);

    await prisma.$transaction(async (tx) => {
      // 1. Update passwordHash only - strictly preserving profile, role, permissions, and isActive status
      await tx.user.update({
        where: { id },
        data: { passwordHash },
      });

      // 2. Invalidate all active sessions/refresh tokens for the user
      await tx.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });

      // 3. Record administrative reset event in audit log without logging the password or its hash
      await tx.auditLog.create({
        data: {
          organizationId,
          userId: requesterId,
          action: 'USER_MANAGE',
          entityType: 'User',
          entityId: id,
          description: `Administratively reset password for user ${existing.email}`,
          metadata: {
            operation: 'RESET_PASSWORD',
            targetUserId: id,
            targetEmail: existing.email,
          },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });
    });

    res.json({
      success: true,
      message: 'Password reset successfully / تم إعادة تعيين كلمة المرور بنجاح',
    });
  }
);

/**
 * POST /api/organizations/users/:id/activate
 * Re-activate a deactivated user account. Requires MANAGE_SETTINGS.
 */
router.post(
  '/users/:id/activate',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: requesterId } = authReq.user;
    const { id } = req.params;

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('User');
    }
    assertSameOrg(organizationId, existing.organizationId, 'User');

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { isActive: true },
        select: {
          id: true,
          email: true,
          nameAr: true,
          nameEn: true,
          role: true,
          permissions: true,
          isActive: true,
          updatedAt: true,
        },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: requesterId,
          action: 'USER_MANAGE',
          entityType: 'User',
          entityId: id,
          description: `Activated user account ${existing.email}`,
          metadata: { operation: 'ACTIVATE_USER', targetUserId: id },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return u;
    });

    res.json({
      success: true,
      message: 'User activated successfully / تم تفعيل المستخدم بنجاح',
      data: {
        ...updated,
        effectivePermissions: resolveUserPermissions(updated.role, updated.permissions),
      },
    });
  }
);

/**
 * POST /api/organizations/users/:id/deactivate
 * Deactivate a user account. Requires MANAGE_SETTINGS.
 */
router.post(
  '/users/:id/deactivate',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: requesterId } = authReq.user;
    const { id } = req.params;

    if (id === requesterId) {
      throw new ValidationError('You cannot deactivate your own account / لا يمكنك تعطيل حسابك بنفسك');
    }

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('User');
    }
    assertSameOrg(organizationId, existing.organizationId, 'User');

    const updated = await prisma.$transaction(async (tx) => {
      const u = await tx.user.update({
        where: { id },
        data: { isActive: false },
        select: {
          id: true,
          email: true,
          nameAr: true,
          nameEn: true,
          role: true,
          permissions: true,
          isActive: true,
          updatedAt: true,
        },
      });

      await tx.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      });

      await tx.auditLog.create({
        data: {
          organizationId,
          userId: requesterId,
          action: 'USER_MANAGE',
          entityType: 'User',
          entityId: id,
          description: `Deactivated user ${existing.email}`,
          metadata: { operation: 'DEACTIVATE_USER', targetUserId: id },
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      });

      return u;
    });

    res.json({
      success: true,
      message: 'User deactivated successfully / تم تعطيل المستخدم بنجاح',
      data: {
        ...updated,
        effectivePermissions: resolveUserPermissions(updated.role, updated.permissions),
      },
    });
  }
);

/**
 * DELETE /api/organizations/users/:id
 * Soft-delete (deactivate) a user. Requires MANAGE_SETTINGS.
 */
router.delete(
  '/users/:id',
  requirePermission(PERMISSIONS.MANAGE_SETTINGS),
  async (req, res: Response) => {
    const authReq = req as AuthenticatedRequest;
    const { organizationId, id: requesterId } = authReq.user;
    const { id } = req.params;

    if (id === requesterId) {
      throw new ValidationError('You cannot deactivate your own account');
    }

    const existing = await prisma.user.findUnique({
      where: { id },
    });

    if (!existing) {
      throw new NotFoundError('User');
    }
    assertSameOrg(organizationId, existing.organizationId, 'User');

    const isPermanent = req.query.permanent === 'true' || req.query.mode === 'permanent';
    if (isPermanent) {
      const [auditCount, workCreated, workApproved, statementsCreated, invoicesCreated, paymentsRecorded] = await Promise.all([
        prisma.auditLog.count({ where: { userId: id } }),
        prisma.workEntry.count({ where: { createdById: id } }),
        prisma.workEntry.count({ where: { approvedById: id } }),
        prisma.statement.count({ where: { createdById: id } }),
        prisma.invoice.count({ where: { createdById: id } }),
        prisma.payment.count({ where: { recordedById: id } }),
      ]);
      const totalActivities = auditCount + workCreated + workApproved + statementsCreated + invoicesCreated + paymentsRecorded;
      if (totalActivities > 0) {
        throw new BusinessRuleError(
          `Cannot permanently delete user because they have recorded system activities (${totalActivities} historical records). Deactivate the user instead to maintain audit compliance.`
        );
      }
      await prisma.$transaction([
        prisma.refreshToken.deleteMany({ where: { userId: id } }),
        prisma.user.delete({ where: { id } }),
        prisma.auditLog.create({
          data: {
            organizationId,
            userId: requesterId,
            action: 'DELETE',
            entityType: 'User',
            entityId: id,
            description: `Permanently deleted user ${existing.email}`,
            metadata: { operation: 'PERMANENT_DELETE', email: existing.email },
            ipAddress: req.ip || req.socket.remoteAddress,
          },
        }),
      ]);
      return res.json({ success: true, message: 'User deleted permanently' });
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id },
        data: { isActive: false },
      }),
      prisma.refreshToken.updateMany({
        where: { userId: id },
        data: { revokedAt: new Date() },
      }),
      prisma.auditLog.create({
        data: {
          organizationId,
          userId: requesterId,
          action: 'USER_MANAGE',
          entityType: 'User',
          entityId: id,
          description: `Deactivated user ${existing.email}`,
          ipAddress: req.ip || req.socket.remoteAddress,
        },
      }),
    ]);

    res.json({ success: true, message: 'User deactivated successfully' });
  }
);

// ─── ZATCA Phase 2 E-Invoicing Management & Onboarding ───────────

/**
 * GET /api/organizations/zatca/status
 * Returns current ZATCA onboarding status, environment, and readiness checklist.
 */
router.get('/zatca/status', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });

  const hasBusinessName = Boolean(settings?.businessName?.trim());
  const hasVatNumber = Boolean(settings?.vatNumber && /^3\d{13}3$/.test(settings.vatNumber.trim()));
  const hasAddress = Boolean(settings?.address?.trim());
  const hasComplianceCsid = Boolean(settings?.zatcaComplianceCsid);
  const hasProductionCsid = Boolean(settings?.zatcaCsid);
  const isEnabled = settings?.zatcaEnabled === true;

  const checklist = [
    { key: 'BUSINESS_NAME', labelAr: 'اسم المنشأة بالعربية', labelEn: 'Arabic Business Name', passed: hasBusinessName },
    { key: 'VAT_NUMBER', labelAr: 'الرقم الضريبي (15 رقماً يبدأ وينتهي بـ 3)', labelEn: '15-digit VAT Number', passed: hasVatNumber },
    { key: 'ADDRESS', labelAr: 'عنوان المنشأة الوطني', labelEn: 'National Address', passed: hasAddress },
    { key: 'COMPLIANCE_CSID', labelAr: 'شهادة الامتثال الفني (Compliance CSID)', labelEn: 'Compliance CSID', passed: hasComplianceCsid },
    { key: 'PRODUCTION_CSID', labelAr: 'شهادة الربط المباشر للإنتاج (Production CSID)', labelEn: 'Production CSID', passed: hasProductionCsid },
    { key: 'ZATCA_ENABLED', labelAr: 'تفعيل الربط الإلكتروني المباشر', labelEn: 'ZATCA Integration Active', passed: isEnabled },
  ];

  res.json({
    success: true,
    data: {
      zatcaEnabled: isEnabled,
      zatcaEnvironment: settings?.zatcaEnvironment || 'sandbox',
      zatcaOnboardingStatus: settings?.zatcaOnboardingStatus || 'NOT_ONBOARDED',
      egsUuid: settings?.zatcaEgsUuid || null,
      hasComplianceCsid,
      hasProductionCsid,
      certExpiry: settings?.zatcaCertExpiry || null,
      lastSync: settings?.zatcaLastSync || null,
      checklist,
      isReadyForProduction: hasBusinessName && hasVatNumber && hasAddress && hasProductionCsid && isEnabled,
    },
  });
});

/**
 * POST /api/organizations/zatca/csr
 * Generates an ECDSA secp256k1 keypair and Certificate Signing Request (CSR) for ZATCA Fatoora Portal onboarding.
 */
router.post('/zatca/csr', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId } = authReq.user;

  const settings = await prisma.orgSettings.findUnique({
    where: { organizationId },
  });

  if (!settings?.businessName?.trim()) {
    throw new ValidationError('اسم المنشأة الرسمي مطلوب في الإعدادات لتوليد الشهادة');
  }
  if (!settings?.vatNumber || !/^3\d{13}3$/.test(settings.vatNumber.trim())) {
    throw new ValidationError('الرقم الضريبي للمنشأة غير صالح (يجب أن يتكون من 15 رقماً ويبدأ وينتهي بـ 3)');
  }

  const { commonName, branchName } = req.body;
  const cn = commonName?.trim() || `EGS-${settings.vatNumber.slice(-6)}-${Date.now().toString().slice(-4)}`;

  const { csrBase64, egsUuid } = zatcaService.generateEgsCsr({
    commonName: cn,
    organizationName: settings.businessName,
    vatNumber: settings.vatNumber,
    branchName: branchName || 'Main',
    city: settings.city || 'Riyadh',
    solutionName: 'BUNYAN-Construction-ERP',
  });

  await prisma.orgSettings.update({
    where: { organizationId },
    data: {
      zatcaEgsUuid: egsUuid,
      zatcaOnboardingStatus: 'CSR_GENERATED',
    },
  });

  res.json({
    success: true,
    data: {
      egsUuid,
      commonName: cn,
      csrBase64,
    },
    message: 'تم توليد مفتاح التشفير وطلب الشهادة (CSR) بنجاح. يمكنك استخدامه مع رمز OTP على منصة فاتورة للحصول على شهادة الامتثال.',
  });
});

/**
 * POST /api/organizations/zatca/onboard
 * Calls official ZATCA Compliance CSID API with OTP from Fatoora portal.
 */
router.post('/zatca/onboard', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const { otp, csrBase64, environment } = req.body;
  if (!otp || typeof otp !== 'string' || !otp.trim()) {
    throw new ValidationError('رمز التحقق (OTP) من منصة فاتورة مطلوب لإتمام الربط');
  }
  if (!csrBase64 || typeof csrBase64 !== 'string') {
    throw new ValidationError('طلب الشهادة المشفر (CSR) مطلوب');
  }

  const targetEnv = environment || 'sandbox';

  try {
    const csidResult = await zatcaService.requestComplianceCsid({
      otp: otp.trim(),
      csrBase64: csrBase64.trim(),
      environment: targetEnv,
    });

    await prisma.orgSettings.update({
      where: { organizationId },
      data: {
        zatcaEnvironment: targetEnv,
        zatcaComplianceReqId: csidResult.requestID,
        zatcaComplianceCsid: csidResult.binarySecurityToken,
        zatcaComplianceSecret: csidResult.secret,
        zatcaOnboardingStatus: 'COMPLIANCE_PASSED',
        zatcaLastSync: new Date(),
      },
    });

    await prisma.auditLog.create({
      data: {
        organizationId,
        userId,
        action: 'SETTINGS_UPDATE',
        entityType: 'OrganizationSettings',
        entityId: organizationId,
        description: `Successfully onboarded ZATCA Compliance CSID (Request ID: ${csidResult.requestID}) in ${targetEnv} environment`,
      },
    });

    res.json({
      success: true,
      data: {
        requestID: csidResult.requestID,
        environment: targetEnv,
        status: 'COMPLIANCE_PASSED',
      },
      message: 'تم استلام شهادة الامتثال (Compliance CSID) بنجاح من منصة فاتورة.',
    });
  } catch (err: any) {
    res.status(422).json({
      success: false,
      error: {
        code: 'ZATCA_ONBOARDING_ERROR',
        message: err.message,
      },
    });
  }
});

/**
 * PUT /api/organizations/zatca/settings
 * Configures ZATCA environment, toggles enabled status, or saves existing CSID credentials manually.
 */
router.put('/zatca/settings', requirePermission(PERMISSIONS.MANAGE_SETTINGS), async (req, res: Response) => {
  const authReq = req as AuthenticatedRequest;
  const { organizationId, id: userId } = authReq.user;

  const {
    zatcaEnabled,
    zatcaEnvironment,
    zatcaCsid,
    zatcaSecret,
    zatcaComplianceCsid,
    zatcaComplianceSecret,
  } = req.body;

  const updateData: Prisma.OrgSettingsUpdateInput = {};

  if (zatcaEnabled !== undefined) updateData.zatcaEnabled = Boolean(zatcaEnabled);
  if (zatcaEnvironment) {
    const env = String(zatcaEnvironment).toLowerCase();
    if (['sandbox', 'simulation', 'production'].includes(env)) {
      updateData.zatcaEnvironment = env;
    }
  }
  if (zatcaCsid !== undefined) updateData.zatcaCsid = zatcaCsid ? String(zatcaCsid).trim() : null;
  if (zatcaSecret !== undefined) updateData.zatcaSecret = zatcaSecret ? String(zatcaSecret).trim() : null;
  if (zatcaComplianceCsid !== undefined) {
    updateData.zatcaComplianceCsid = zatcaComplianceCsid ? String(zatcaComplianceCsid).trim() : null;
  }
  if (zatcaComplianceSecret !== undefined) {
    updateData.zatcaComplianceSecret = zatcaComplianceSecret ? String(zatcaComplianceSecret).trim() : null;
  }

  // Auto-update onboarding status if CSID is provided
  if (zatcaCsid) {
    updateData.zatcaOnboardingStatus = 'ACTIVE';
  } else if (zatcaComplianceCsid) {
    updateData.zatcaOnboardingStatus = 'COMPLIANCE_PASSED';
  }

  const updated = await prisma.orgSettings.update({
    where: { organizationId },
    data: updateData,
  });

  await prisma.auditLog.create({
    data: {
      organizationId,
      userId,
      action: 'SETTINGS_UPDATE',
      entityType: 'OrganizationSettings',
      entityId: organizationId,
      description: `Updated ZATCA settings: enabled=${updated.zatcaEnabled}, env=${updated.zatcaEnvironment}`,
    },
  });

  res.json({
    success: true,
    data: updated,
    message: 'تم حفظ إعدادات الربط مع هيئة الزكاة والضريبة والجمارك بنجاح.',
  });
});

export default router;
