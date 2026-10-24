// =============================================================
// Test helpers — shared across test files
// =============================================================
import { prisma } from '../lib/prisma';
import { authService } from '../services/authService';
import app from '../app';
import supertest from 'supertest';

export const request = supertest(app);

export interface TestOrg {
  orgId: string;
  userId: string;
  accessToken: string;
  refreshToken: string;
}

/**
 * Create a test organization + admin user and return auth tokens.
 */
export async function createTestOrg(suffix = 'test'): Promise<TestOrg> {
  const result = await authService.register({
    organizationName: `Test Org ${suffix}`,
    email: `admin-${suffix}@test.com`,
    password: 'Password1',
    nameAr: `مدير اختبار ${suffix}`,
  });

  await prisma.orgSettings.update({
    where: { organizationId: result.user.organizationId },
    data: {
      vatNumber: '310000000000003',
      address: 'الرياض - المملكة العربية السعودية',
    },
  });

  return {
    orgId: result.user.organizationId,
    userId: result.user.id,
    accessToken: result.tokens.accessToken,
    refreshToken: result.tokens.refreshToken,
  };
}

/**
 * Create a test client.
 */
export async function createTestClient(orgId: string, overrides = {}) {
  return prisma.client.create({
    data: {
      organizationId: orgId,
      nameAr: 'عميل اختباري',
      nameEn: 'Test Client',
      clientType: 'COMPANY',
      vatNumber: '300000000000003',
      address: 'الرياض - حي العليا',
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

/**
 * Create a test site.
 */
export async function createTestSite(orgId: string, clientId: string, overrides = {}) {
  return prisma.site.create({
    data: {
      organizationId: orgId,
      clientId,
      nameAr: 'موقع اختباري',
      nameEn: 'Test Site',
      status: 'ACTIVE',
      ...overrides,
    },
  });
}

/**
 * Create a test work item template.
 */
export async function createTestWorkItem(orgId: string, overrides = {}) {
  return prisma.workItemTemplate.create({
    data: {
      organizationId: orgId,
      nameAr: 'بند اختباري',
      nameEn: 'Test Item',
      unit: 'م²',
      unitEn: 'm²',
      defaultPrice: 100,
      isActive: true,
      ...overrides,
    },
  });
}

/**
 * Create a work entry and optionally approve it.
 */
export async function createTestWorkEntry(
  orgId: string,
  clientId: string,
  siteId: string,
  createdById: string,
  options: { approved?: boolean; approvedById?: string; quantity?: number; unitPrice?: number } = {}
) {
  const quantity = options.quantity ?? 10;
  const unitPrice = options.unitPrice ?? 100;

  // Get or create sequence
  await prisma.documentSequence.upsert({
    where: { organizationId_docType: { organizationId: orgId, docType: 'work_entry' } },
    update: { lastNumber: { increment: 1 } },
    create: {
      organizationId: orgId,
      docType: 'work_entry',
      prefix: 'WRK',
      lastNumber: 1,
      currentYear: new Date().getFullYear(),
    },
  });

  const seq = await prisma.documentSequence.findUnique({
    where: { organizationId_docType: { organizationId: orgId, docType: 'work_entry' } },
  });

  const referenceNo = `WRK-${new Date().getFullYear()}-${String(seq!.lastNumber).padStart(4, '0')}`;

  const entry = await prisma.workEntry.create({
    data: {
      organizationId: orgId,
      clientId,
      siteId,
      referenceNo,
      itemNameAr: 'عمل اختباري',
      itemNameEn: 'Test Work',
      unit: 'م²',
      quantity,
      unitPrice,
      totalAmount: quantity * unitPrice,
      billedQuantity: 0,
      workDate: new Date(),
      status: options.approved ? 'APPROVED' : 'DRAFT',
      createdById,
      approvedById: options.approved ? (options.approvedById ?? createdById) : null,
      approvedAt: options.approved ? new Date() : null,
    },
  });

  return entry;
}

/**
 * Auth header helper.
 */
export function authHeader(token: string) {
  return { Authorization: `Bearer ${token}` };
}
