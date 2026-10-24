import { Router, Response } from 'express';
import { prisma } from '../lib/prisma';
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
    passwordHash: _ph,
    organizationId: _oid,
    id: _id,
    createdAt: _ca,
    updatedAt: _ua,
    ...updateData
  } = req.body;

  const data: Record<string, unknown> = { ...updateData };

  if (password) {
    if (String(password).length < 8) {
      throw new ValidationError('Password must be at least 8 characters');
    }
    data.passwordHash = await bcrypt.hash(password, 12);
  }

  if (email) {
    data.email = String(email).toLowerCase().trim();
  }

  // Only users with MANAGE_SETTINGS can change roles, permissions, or active status
  if (!canManageSettings) {
    delete data.role;
    delete data.permissions;
    delete data.isActive;
  } else if (Array.isArray(data.permissions)) {
    data.permissions = (data.permissions as string[]).filter((p) =>
      ALL_PERMISSIONS.includes(p as any)
    );
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

export default router;
