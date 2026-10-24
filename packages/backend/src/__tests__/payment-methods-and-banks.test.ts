import { request, createTestOrg, authHeader, TestOrg, createTestClient } from './helpers';
import { prisma } from '../lib/prisma';
import { PaymentMethod, PaymentStatus, InvoiceStatus, InvoiceType } from '@prisma/client';
import { Decimal } from '@prisma/client/runtime/library';

describe('BUNYAN Payment Methods & Company Receiving Bank Accounts', () => {
  let org: TestOrg;
  let client: any;
  let invoice: any;

  beforeAll(async () => {
    org = await createTestOrg(`pay_bank_${Date.now()}`);
    client = await createTestClient(org.orgId, { nameAr: 'شركة المقاولات المتحدة' });

    // Create a test invoice
    invoice = await prisma.invoice.create({
      data: {
        organizationId: org.orgId,
        clientId: client.id,
        referenceNo: `INV-TEST-${Date.now()}`,
        invoiceType: InvoiceType.TAX_INVOICE,
        issueDate: new Date(),
        subtotal: new Decimal('10000.0000'),
        taxableAmount: new Decimal('10000.0000'),
        vatRate: new Decimal('15.00'),
        vatAmount: new Decimal('1500.0000'),
        totalAmount: new Decimal('11500.0000'),
        paidAmount: new Decimal('0.0000'),
        remainingAmount: new Decimal('11500.0000'),
        status: InvoiceStatus.APPROVED,
        paymentStatus: PaymentStatus.UNPAID,
        createdById: org.userId,
        orgSnapshot: { businessName: 'بنيان للتجارة والمقاولات' },
        clientSnapshot: { nameAr: client.nameAr },
      },
    });
  });

  describe('1. Company Receiving Bank Accounts Management', () => {
    let bankAccount1Id: string;
    let bankAccount2Id: string;

    it('creates a primary company receiving bank account (auto-set as default)', async () => {
      const res = await request
        .post('/api/organizations/bank-accounts')
        .send({
          bankNameAr: 'البنك الأهلي السعودي',
          bankNameEn: 'Saudi National Bank (SNB)',
          beneficiaryNameAr: 'شركة بنيان للمقاولات',
          beneficiaryNameEn: 'BUNYAN CONTRACTING CO.',
          iban: 'SA0310000000000000000001',
          accountNumber: '10000000000001',
          currency: 'SAR',
          branch: 'الفرع الرئيسي بالرياض',
          isDefault: true,
          isActive: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.bankNameAr).toBe('البنك الأهلي السعودي');
      expect(res.body.data.isDefault).toBe(true);
      expect(res.body.data.iban).toBe('SA0310000000000000000001');
      bankAccount1Id = res.body.data.id;
    });

    it('rejects duplicate IBAN within the same organization', async () => {
      const res = await request
        .post('/api/organizations/bank-accounts')
        .send({
          bankNameAr: 'مصرف الراجحي',
          bankNameEn: 'Al Rajhi Bank',
          beneficiaryNameAr: 'شركة بنيان للمقاولات',
          beneficiaryNameEn: 'BUNYAN CONTRACTING CO.',
          iban: 'SA03 1000 0000 0000 0000 0001', // same IBAN with spaces
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(409);
      expect(res.body.error.message).toContain('مسجل مسبقاً');
    });

    it('creates a secondary company bank account and allows setting it as default', async () => {
      const res = await request
        .post('/api/organizations/bank-accounts')
        .send({
          bankNameAr: 'مصرف الراجحي',
          bankNameEn: 'Al Rajhi Bank',
          beneficiaryNameAr: 'شركة بنيان للمقاولات',
          beneficiaryNameEn: 'BUNYAN CONTRACTING CO.',
          iban: 'SA0380000000000000000002',
          accountNumber: '80000000000002',
          currency: 'SAR',
          isDefault: false,
          isActive: true,
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.isDefault).toBe(false);
      bankAccount2Id = res.body.data.id;

      // Now set bankAccount2 as default
      const setDefaultRes = await request
        .put(`/api/organizations/bank-accounts/${bankAccount2Id}/set-default`)
        .set(authHeader(org.accessToken));

      expect(setDefaultRes.status).toBe(200);
      expect(setDefaultRes.body.data.isDefault).toBe(true);

      // Verify that bankAccount1 is no longer default
      const checkBank1 = await prisma.orgBankAccount.findUnique({ where: { id: bankAccount1Id } });
      expect(checkBank1?.isDefault).toBe(false);
    });

    it('lists all company receiving bank accounts with default listed first', async () => {
      const res = await request
        .get('/api/organizations/bank-accounts')
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body.data)).toBe(true);
      expect(res.body.data.length).toBeGreaterThanOrEqual(2);
      expect(res.body.data[0].id).toBe(bankAccount2Id); // default is first
    });
  });

  describe('2. Multi-Method Payment Registration & Conditional Fields', () => {
    it('records a Bank Transfer payment with receiving bank account and transfer reference', async () => {
      const defaultBank = await prisma.orgBankAccount.findFirst({
        where: { organizationId: org.orgId, isDefault: true },
      });

      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 3000,
          paymentDate: '2026-10-24',
          method: 'BANK_TRANSFER',
          referenceNo: 'TRF-SNB-998822',
          bankAccountId: defaultBank?.id,
          senderBankName: 'بنك الرياض (حساب العميل)',
          transferDate: '2026-10-24',
          notes: 'حوالة سداد الدفعة الأولى',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('BANK_TRANSFER');
      expect(res.body.data.referenceNo).toBe('TRF-SNB-998822');
      expect(res.body.data.senderBankName).toBe('بنك الرياض (حساب العميل)');
      expect(res.body.data.bankAccountId).toBe(defaultBank?.id);

      // Verify invoice state
      const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      expect(Number(updatedInvoice?.paidAmount)).toBe(3000);
      expect(Number(updatedInvoice?.remainingAmount)).toBe(8500);
      expect(updatedInvoice?.paymentStatus).toBe(PaymentStatus.PARTIALLY_PAID);
    });

    it('records a Cash payment without requiring bank fields', async () => {
      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 1500,
          paymentDate: '2026-10-24',
          method: 'CASH',
          receiptNumber: 'VOUCHER-CSH-042',
          notes: 'سداد نقدي في مكتب الإدارة المالية',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('CASH');
      expect(res.body.data.receiptNumber).toBe('VOUCHER-CSH-042');
      expect(res.body.data.bankAccountId).toBeNull();

      // Check invoice balance
      const updatedInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      expect(Number(updatedInvoice?.paidAmount)).toBe(4500);
      expect(Number(updatedInvoice?.remainingAmount)).toBe(7000);
    });

    it('records a Card payment capturing card provider and authorization reference', async () => {
      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 2000,
          paymentDate: '2026-10-24',
          method: 'CARD',
          cardProvider: 'MADA',
          referenceNo: 'AUTH-POS-77491',
          terminalId: 'TERM-01994',
          notes: 'دفع عبر نقطة بيع مدى',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.method).toBe('CARD');
      expect(res.body.data.cardProvider).toBe('MADA');
      expect(res.body.data.referenceNo).toBe('AUTH-POS-77491');
      expect(res.body.data.terminalId).toBe('TERM-01994');
    });

    it('records a Cheque payment requiring cheque number', async () => {
      // Cheque missing number should fail
      const failRes = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 2000,
          paymentDate: '2026-10-24',
          method: 'CHEQUE',
        })
        .set(authHeader(org.accessToken));
      expect(failRes.status).toBe(400);
      expect(failRes.body.error.message).toContain('رقم الشيك');

      // Valid cheque payment
      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 2000,
          paymentDate: '2026-10-24',
          method: 'CHEQUE',
          chequeNumber: 'CHQ-556600',
          senderBankName: 'البنك العربي الوطني',
          chequeDate: '2026-10-24',
          notes: 'شيك مصدق مسحوب على البنك العربي',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);
      expect(res.body.data.method).toBe('CHEQUE');
      expect(res.body.data.chequeNumber).toBe('CHQ-556600');
      expect(res.body.data.senderBankName).toBe('البنك العربي الوطني');
    });

    it('settles the final remaining balance and transitions invoice to fully PAID', async () => {
      // Current paid: 3000 + 1500 + 2000 + 2000 = 8500 SAR. Remaining: 3000 SAR.
      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 3000,
          paymentDate: '2026-10-24',
          method: 'BANK_TRANSFER',
          referenceNo: 'FINAL-TRF-110022',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(201);

      const finalInvoice = await prisma.invoice.findUnique({ where: { id: invoice.id } });
      expect(Number(finalInvoice?.paidAmount)).toBe(11500);
      expect(Number(finalInvoice?.remainingAmount)).toBe(0);
      expect(finalInvoice?.paymentStatus).toBe(PaymentStatus.PAID);
    });

    it('prevents overpayment beyond zero remaining balance', async () => {
      const res = await request
        .post('/api/payments')
        .send({
          invoiceId: invoice.id,
          amount: 50,
          paymentDate: '2026-10-24',
          method: 'CASH',
        })
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('exceeds remaining balance');
    });
  });

  describe('3. Historical Integrity & Bank Deletion Protection', () => {
    it('prevents deleting a company bank account that is referenced by recorded payments', async () => {
      const defaultBank = await prisma.orgBankAccount.findFirst({
        where: { organizationId: org.orgId, isDefault: true },
      });

      const res = await request
        .delete(`/api/organizations/bank-accounts/${defaultBank?.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(422);
      expect(res.body.error.message).toContain('لا يمكن حذف هذا الحساب البنكي');
    });

    it('retrieves invoice with full payment transactions and company default bank account', async () => {
      const res = await request
        .get(`/api/invoices/${invoice.id}`)
        .set(authHeader(org.accessToken));

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const inv = res.body.data;
      expect(inv.payments.length).toBe(5);
      expect(inv.defaultBankAccount).toBeDefined();
      expect(inv.defaultBankAccount.isDefault).toBe(true);

      // Verify that bank transfer payment includes company bank details
      const bankTransferPayment = inv.payments.find((p: any) => p.method === 'BANK_TRANSFER');
      expect(bankTransferPayment.bankAccount).toBeDefined();
      expect(bankTransferPayment.bankAccount.iban).toBeTruthy();
    });
  });
});
