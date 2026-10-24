import { request, createTestOrg, authHeader, TestOrg } from './helpers';
import { prisma } from '../lib/prisma';
import { UserRole } from '@prisma/client';

describe('Multi-Country Configuration & Regional Management API', () => {
  let org: TestOrg & { staffAccessToken?: string };

  beforeAll(async () => {
    org = await createTestOrg(`country_${Date.now()}`);

    // Create staff user without MANAGE_SETTINGS permission
    const staffUser = await prisma.user.create({
      data: {
        organizationId: org.orgId,
        email: `staff_country_${Date.now()}@bunyan.test`,
        passwordHash: 'dummy_hash',
        nameAr: 'موظف تجريبي',
        nameEn: 'Staff Test',
        role: UserRole.ORG_STAFF,
      },
    });

    const jwt = require('jsonwebtoken');
    const { config } = require('../config');
    org.staffAccessToken = jwt.sign(
      {
        userId: staffUser.id,
        organizationId: org.orgId,
        email: staffUser.email,
        role: UserRole.ORG_STAFF,
        nameAr: staffUser.nameAr,
        nameEn: staffUser.nameEn,
      },
      config.jwtAccessSecret,
      { expiresIn: '1h' }
    );
  });

  describe('1. Auto-seeding and Listing Configured Countries', () => {
    it('automatically initializes Saudi Arabia as default active country when first queried', async () => {
      const res = await request
        .get('/api/organizations/countries')
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const list = res.body.data;
      expect(list.length).toBeGreaterThanOrEqual(1);

      const saudi = list.find((c: any) => c.countryCode === 'SA');
      expect(saudi).toBeDefined();
      expect(saudi.isDefault).toBe(true);
      expect(saudi.isActive).toBe(true);
      expect(saudi.currencyCode).toBe('SAR');
      expect(Number(saudi.standardTaxRate)).toBe(15);
      expect(saudi.electronicInvoicingStatus).toBe('ZATCA_PHASE_2');
    });
  });

  describe('2. Adding Supported Countries (ISO 3166-1 / ISO 4217)', () => {
    let uaeId: string;

    it('rejects country creation by unauthorized staff members', async () => {
      const res = await request
        .post('/api/organizations/countries')
        .send({
          countryCode: 'AE',
          nameAr: 'الإمارات العربية المتحدة',
          nameEn: 'United Arab Emirates',
          currencyCode: 'AED',
          standardTaxRate: 5,
        })
        .set(authHeader(org.staffAccessToken!));

      expect(res.status).toBe(403);
    });

    it('rejects invalid country code format', async () => {
      const res = await request
        .post('/api/organizations/countries')
        .send({
          countryCode: 'UAE', // 3 letters instead of 2
          nameAr: 'الإمارات',
          nameEn: 'UAE',
          currencyCode: 'AED',
          standardTaxRate: 5,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(400);
      expect(res.body.error.message).toContain('ISO 3166-1');
    });

    it('adds a valid new country configuration (UAE) with standard 5% tax and AED currency', async () => {
      const res = await request
        .post('/api/organizations/countries')
        .send({
          countryCode: 'AE',
          nameAr: 'الإمارات العربية المتحدة',
          nameEn: 'United Arab Emirates',
          currencyCode: 'AED',
          currencyNameAr: 'درهم إماراتي',
          currencyNameEn: 'UAE Dirham',
          currencySymbol: 'د.إ',
          standardTaxRate: 5,
          taxNumber: '100234567800003',
          taxNumberLabelAr: 'رقم التسجيل الضريبي (TRN)',
          taxNumberLabelEn: 'Tax Registration Number (TRN)',
          commercialReg: 'CN-1029384',
          commercialRegLabelAr: 'الرخصة التجارية',
          commercialRegLabelEn: 'Trade License Number',
          timezone: 'Asia/Dubai',
          phoneCode: '+971',
          electronicInvoicingStatus: 'STANDARD',
          isDefault: false,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.countryCode).toBe('AE');
      expect(res.body.data.currencyCode).toBe('AED');
      expect(Number(res.body.data.standardTaxRate)).toBe(5);
      expect(res.body.data.isDefault).toBe(false);
      uaeId = res.body.data.id;
    });

    it('prevents accidental duplicate country code registration for the same organization', async () => {
      const res = await request
        .post('/api/organizations/countries')
        .send({
          countryCode: 'AE',
          nameAr: 'الإمارات العربية المتحدة',
          nameEn: 'United Arab Emirates',
          currencyCode: 'AED',
          standardTaxRate: 5,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('already configured');
    });

    it('updates country specific tax rate and registration details', async () => {
      const res = await request
        .put(`/api/organizations/countries/${uaeId}`)
        .send({
          standardTaxRate: 5.5,
          commercialReg: 'CN-9999999',
          notes: 'Updated Dubai trade license branch',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Number(res.body.data.standardTaxRate)).toBe(5.5);
      expect(res.body.data.commercialReg).toBe('CN-9999999');
    });

    it('switches the default country atomically and preserves other countries as active', async () => {
      const res = await request
        .put(`/api/organizations/countries/${uaeId}/set-default`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.data.isDefault).toBe(true);

      // Verify that Saudi Arabia is now not default, but still active and preserved
      const allCountries = await prisma.orgCountry.findMany({
        where: { organizationId: org.orgId },
      });
      const sa = allCountries.find((c) => c.countryCode === 'SA');
      const uae = allCountries.find((c) => c.countryCode === 'AE');

      expect(uae?.isDefault).toBe(true);
      expect(sa?.isDefault).toBe(false);
      expect(sa?.isActive).toBe(true);
    });

    it('prevents deactivating or deleting the active default country', async () => {
      // Try to deactivate UAE while it is default
      const deactRes = await request
        .put(`/api/organizations/countries/${uaeId}`)
        .send({ isActive: false })
        .set(authHeader(org.accessToken));

      expect(deactRes.status).toBe(422);

      // Try to delete UAE while it is default
      const delRes = await request
        .delete(`/api/organizations/countries/${uaeId}`)
        .set(authHeader(org.accessToken));

      expect(delRes.status).toBe(422);
    });

    it('allows deleting non-default country after setting another default', async () => {
      // First restore SA as default
      const saRecord = await prisma.orgCountry.findFirst({
        where: { organizationId: org.orgId, countryCode: 'SA' },
      });
      await request
        .put(`/api/organizations/countries/${saRecord!.id}/set-default`)
        .set(authHeader(org.accessToken));

      // Now UAE can be safely deleted
      const delRes = await request
        .delete(`/api/organizations/countries/${uaeId}`)
        .set(authHeader(org.accessToken));

      expect(delRes.status).toBe(200);
      expect(delRes.body.success).toBe(true);

      // Verify SA remains intact
      const remaining = await prisma.orgCountry.findMany({
        where: { organizationId: org.orgId },
      });
      expect(remaining.length).toBe(1);
      expect(remaining[0].countryCode).toBe('SA');
      expect(remaining[0].isDefault).toBe(true);
    });
  });
});
