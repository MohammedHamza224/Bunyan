// =============================================================
// Tests: Phase 3 — Statements, Invoices, Anti-Double-Billing Concurrency,
// VAT, Mandatory ZATCA Validation, Real QR Code, ICV/PIH Chaining,
// Credit/Debit Notes & Payments
// =============================================================
import { request, createTestOrg, authHeader } from './helpers';
import { prisma } from '../lib/prisma';
import { ZATCA_GENESIS_PIH } from '../utils/zatca';

describe('Phase 3: Statements, Invoices, Concurrency, ZATCA (QR, ICV/PIH, Credit/Debit Notes) & Payments', () => {
  let org: Awaited<ReturnType<typeof createTestOrg>>;
  let clientB2BId: string;
  let clientB2CId: string;
  let siteId: string;
  let siteB2CId: string;

  beforeAll(async () => {
    org = await createTestOrg('phase3-org');

    // Configure official ZATCA Seller Settings (15-digit Saudi VAT number starting & ending with 3)
    await request
      .put('/api/organizations/settings')
      .set(authHeader(org.accessToken))
      .send({
        businessName: 'شركة المقاولات المتكاملة المحدودة',
        businessNameEn: 'Integrated Contracting Co. Ltd.',
        vatNumber: '310123456700003',
        commercialReg: '1010123456',
        address: 'الرياض - طريق الملك فهد',
        defaultCurrency: 'SAR',
        vatRate: 15,
      });

    // Create B2B Client (Company with valid 15-digit VAT number & address)
    const b2bRes = await request
      .post('/api/clients')
      .set(authHeader(org.accessToken))
      .send({
        nameAr: 'شركة تطوير الأبراج العقارية',
        nameEn: 'Towers Real Estate Dev Co.',
        clientType: 'COMPANY',
        vatNumber: '300987654300003',
        address: 'جدة - حي الشاطئ',
      });
    clientB2BId = b2bRes.body.data.id;

    // Create B2C Client (Individual without VAT number)
    const b2cRes = await request
      .post('/api/clients')
      .set(authHeader(org.accessToken))
      .send({
        nameAr: 'محمد بن عبدالله القحطاني',
        clientType: 'INDIVIDUAL',
        address: 'الرياض - حي الملقا',
      });
    clientB2CId = b2cRes.body.data.id;

    // Create Site for B2B Client
    const siteRes = await request
      .post('/api/sites')
      .set(authHeader(org.accessToken))
      .send({
        clientId: clientB2BId,
        nameAr: 'مشروع البرج الإداري',
      });
    siteId = siteRes.body.data.id;

    // Create Site for B2C Client
    const siteB2CRes = await request
      .post('/api/sites')
      .set(authHeader(org.accessToken))
      .send({
        clientId: clientB2CId,
        nameAr: 'فيلا سكنية - حي الملقا',
      });
    siteB2CId = siteB2CRes.body.data.id;
  });

  describe('1. Work Statements, VAT Configuration & Snapshot Immutability', () => {
    it('creates a statement with discount & 15% VAT, approves it, and serves A4 PDF snapshot data', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          siteId,
          itemNameAr: 'أعمال لياسة داخلية وخارجية',
          unit: 'متر مربع',
          quantity: 50,
          unitPrice: 100,
          workDate: '2026-10-01',
          approveImmediately: true,
        });
      expect(weRes.status).toBe(201);
      const weId = weRes.body.data.id;

      // 30 * 100 = 3000, discount = 200 -> taxable = 2800 -> VAT (15%) = 420 -> total = 3220
      const stmtRes = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          siteIds: [siteId],
          title: 'مستخلص رقم 1 - أعمال اللياسة',
          issueDate: '2026-10-10',
          discountAmount: 200,
          lines: [{ workEntryId: weId, approvedQuantity: 30 }],
        });

      expect(stmtRes.status).toBe(201);
      expect(Number(stmtRes.body.data.subtotal)).toBe(3000);
      expect(Number(stmtRes.body.data.discountAmount)).toBe(200);
      expect(Number(stmtRes.body.data.taxableAmount)).toBe(2800);
      expect(Number(stmtRes.body.data.vatRate)).toBe(15);
      expect(Number(stmtRes.body.data.vatAmount)).toBe(420);
      expect(Number(stmtRes.body.data.totalAmount)).toBe(3220);

      const stmtId = stmtRes.body.data.id;

      const appRes = await request
        .post(`/api/statements/${stmtId}/approve`)
        .set(authHeader(org.accessToken));
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.status).toBe('APPROVED');

      const pdfRes = await request
        .get(`/api/statements/${stmtId}/pdf-data`)
        .set(authHeader(org.accessToken));
      expect(pdfRes.status).toBe(200);
      expect(pdfRes.body.data.orgSnapshot.businessName).toBe('شركة المقاولات المتكاملة المحدودة');
      expect(pdfRes.body.data.lines.length).toBe(1);
    });

    it('supports VAT-exempt (0%) statements and invoices', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          siteId,
          itemNameAr: 'أعمال معفاة من الضريبة',
          unit: 'مقطوعية',
          quantity: 1,
          unitPrice: 2000,
          workDate: '2026-10-02',
          approveImmediately: true,
        });
      const weId = weRes.body.data.id;

      const invRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          issueDate: '2026-10-12',
          isTaxExempt: true,
          lines: [{ workEntryId: weId, quantity: 1 }],
        });

      expect(invRes.status).toBe(201);
      expect(Number(invRes.body.data.vatRate)).toBe(0);
      expect(Number(invRes.body.data.vatAmount)).toBe(0);
      expect(Number(invRes.body.data.totalAmount)).toBe(2000);
    });
  });

  describe('2. Double-Billing Prevention, Concurrency Protection & Cancellation Reversal', () => {
    it('prevents concurrent double-billing of the same work entry using DB row-level locks', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          siteId,
          itemNameAr: 'بند اختبار التزامن ومنع التكرار',
          unit: 'متر',
          quantity: 20,
          unitPrice: 150,
          workDate: '2026-10-05',
          approveImmediately: true,
        });
      const weId = weRes.body.data.id;

      const [res1, res2] = await Promise.all([
        request
          .post('/api/invoices/direct')
          .set(authHeader(org.accessToken))
          .send({
            clientId: clientB2BId,
            issueDate: '2026-10-15',
            lines: [{ workEntryId: weId, quantity: 15 }],
          }),
        request
          .post('/api/invoices/direct')
          .set(authHeader(org.accessToken))
          .send({
            clientId: clientB2BId,
            issueDate: '2026-10-15',
            lines: [{ workEntryId: weId, quantity: 15 }],
          }),
      ]);

      const statuses = [res1.status, res2.status].sort();
      expect(statuses).toEqual([201, 422]);

      const updatedWe = await prisma.workEntry.findUnique({ where: { id: weId } });
      expect(Number(updatedWe!.billedQuantity)).toBe(15);
      expect(updatedWe!.status).toBe('PARTIALLY_BILLED');
    });

    it('reverses billedQuantity and statement status when an invoice is cancelled and blocks editing issued invoices', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          siteId,
          itemNameAr: 'أعمال عزل مائي للأسطح',
          unit: 'متر مربع',
          quantity: 10,
          unitPrice: 80,
          workDate: '2026-10-06',
          approveImmediately: true,
        });
      const weId = weRes.body.data.id;

      const stmtRes = await request
        .post('/api/statements')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2BId,
          issueDate: '2026-10-10',
          lines: [{ workEntryId: weId, approvedQuantity: 10 }],
        });
      const stmtId = stmtRes.body.data.id;

      await request.post(`/api/statements/${stmtId}/approve`).set(authHeader(org.accessToken));

      const invRes = await request
        .post('/api/invoices/from-statement')
        .set(authHeader(org.accessToken))
        .send({
          statementId: stmtId,
          issueDate: '2026-10-12',
        });
      expect(invRes.status).toBe(201);
      const invId = invRes.body.data.id;

      // Approve invoice (allocates ICV = 1, PIH = ZATCA_GENESIS_PIH)
      const appRes = await request
        .post(`/api/invoices/${invId}/approve`)
        .set(authHeader(org.accessToken));
      expect(appRes.status).toBe(200);

      const weAfterBill = await prisma.workEntry.findUnique({ where: { id: weId } });
      expect(weAfterBill!.status).toBe('FULLY_BILLED');
      expect(Number(weAfterBill!.billedQuantity)).toBe(10);

      const editIssuedRes = await request
        .put(`/api/invoices/${invId}`)
        .set(authHeader(org.accessToken))
        .send({ notes: 'تعديل غير مسموح بعد الإصدار' });
      expect(editIssuedRes.status).toBe(422);

      const cancelRes = await request
        .post(`/api/invoices/${invId}/cancel`)
        .set(authHeader(org.accessToken))
        .send({ cancellationReason: 'خطأ في تاريخ التوريد وطلب العميل إعادة الإصدار' });
      expect(cancelRes.status).toBe(200);
      expect(cancelRes.body.data.status).toBe('CANCELLED');

      const weAfterCancel = await prisma.workEntry.findUnique({ where: { id: weId } });
      expect(Number(weAfterCancel!.billedQuantity)).toBe(0);
      expect(weAfterCancel!.status).toBe('APPROVED');

      const stmtAfterCancel = await prisma.statement.findUnique({ where: { id: stmtId } });
      expect(stmtAfterCancel!.status).toBe('APPROVED');
    });
  });

  describe('3. Strict Mandatory ZATCA Validation, Real QR SVG, ICV/PIH Chaining & Credit/Debit Notes', () => {
    it('rejects approving a B2B TAX_INVOICE when Buyer VAT number is missing', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2CId,
          siteId: siteB2CId,
          itemNameAr: 'أعمال دهانات داخلية',
          unit: 'متر مربع',
          quantity: 5,
          unitPrice: 100,
          workDate: '2026-10-16',
          approveImmediately: true,
        });

      // Force TAX_INVOICE (B2B) on an individual client who has NO VAT number
      const invRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2CId,
          invoiceType: 'TAX_INVOICE',
          issueDate: '2026-10-16',
          lines: [{ workEntryId: weRes.body.data.id, quantity: 5 }],
        });
      expect(invRes.status).toBe(201);
      const draftInvId = invRes.body.data.id;

      // Attempting to approve must fail with 422 BusinessRuleError because B2B TAX_INVOICE requires Buyer 15-digit VAT
      const approveFailRes = await request
        .post(`/api/invoices/${draftInvId}/approve`)
        .set(authHeader(org.accessToken));
      expect(approveFailRes.status).toBe(422);
      expect(approveFailRes.body.error.message).toMatch(/رقماً ضريبياً صحيحاً للمشتري|Buyer VAT/i);

      // Cancel this draft so work entry quantity is released
      await request
        .post(`/api/invoices/${draftInvId}/cancel`)
        .set(authHeader(org.accessToken))
        .send({ cancellationReason: 'إلغاء مسودة فاتورة قياسية لعميل فرد بدون رقم ضريبي' });
    });

    it('generates real scannable QR SVG/DataURL, chains ICV & PIH sequentially, and issues Credit & Debit Notes', async () => {
      const weRes = await request
        .post('/api/work-entries')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2CId,
          siteId: siteB2CId,
          itemNameAr: 'صيانة تكييف مركزي',
          unit: 'عملية',
          quantity: 2,
          unitPrice: 500, // subtotal = 1000, VAT (15%) = 150, total = 1150
          workDate: '2026-10-18',
          approveImmediately: true,
        });

      // Create Direct Invoice for Individual Client -> automatically defaults to SIMPLIFIED_TAX_INVOICE
      const invRes = await request
        .post('/api/invoices/direct')
        .set(authHeader(org.accessToken))
        .send({
          clientId: clientB2CId,
          issueDate: '2026-10-18',
          lines: [{ workEntryId: weRes.body.data.id, quantity: 2 }],
        });
      expect(invRes.status).toBe(201);
      expect(invRes.body.data.invoiceType).toBe('SIMPLIFIED_TAX_INVOICE');
      const invId = invRes.body.data.id;

      // Approve Invoice (this is the 2nd approved invoice in this org -> ICV = 2, PIH = invoice #1's xmlHash)
      const appRes = await request
        .post(`/api/invoices/${invId}/approve`)
        .set(authHeader(org.accessToken));
      expect(appRes.status).toBe(200);
      expect(appRes.body.data.zatcaStatus).toBe('SUBMITTED');

      // Inspect ZATCA endpoint
      const zatcaRes = await request
        .get(`/api/invoices/${invId}/zatca`)
        .set(authHeader(org.accessToken));
      expect(zatcaRes.status).toBe(200);

      const zatca = zatcaRes.body.data;
      expect(zatca.zatcaUuid).toMatch(
        /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      );
      expect(zatca.decodedQrTags['1']).toBe('شركة المقاولات المتكاملة المحدودة');
      expect(zatca.decodedQrTags['2']).toBe('310123456700003');
      expect(zatca.decodedQrTags['4']).toBe('1150.00');
      expect(zatca.decodedQrTags['5']).toBe('150.00');

      // Verify Real Scannable QR Code SVG & Data URL
      expect(zatca.qrCodeSvg).toContain('<svg');
      expect(zatca.qrCodeSvg).toContain('<path');
      expect(zatca.qrCodeDataUrl).toMatch(/^data:image\/png;base64,/);

      // Verify ICV & PIH Cryptographic Chaining
      expect(zatca.icv).toBe(2);
      expect(zatca.pih).not.toBe(ZATCA_GENESIS_PIH);
      expect(zatca.chainValid).toBe(true);
      expect(zatca.zatcaXml).toContain('<cbc:ID>ICV</cbc:ID>');
      expect(zatca.zatcaXml).toContain('<cbc:UUID>2</cbc:UUID>');
      expect(zatca.zatcaXml).toContain('<cbc:ID>PIH</cbc:ID>');
      expect(zatca.zatcaXml).toContain('<cbc:InvoiceTypeCode name="0200000">388</cbc:InvoiceTypeCode>');
      expect(zatca.zatcaXml).toContain('<cbc:CompanyID>310123456700003</cbc:CompanyID>');

      // Issue a ZATCA Credit Note (381) for 200 SAR + 15% VAT (30 SAR) = 230 SAR against this invoice
      const cnRes = await request
        .post(`/api/invoices/${invId}/notes`)
        .set(authHeader(org.accessToken))
        .send({
          noteType: 'CREDIT_NOTE',
          reason: 'خصم متفق عليه بعد الإصدار لتسوية الملاحظات',
          issueDate: '2026-10-19',
          lines: [
            {
              itemNameAr: 'تسوية خصم على أعمال التكييف',
              unit: 'مقطوعية',
              quantity: 1,
              unitPrice: 200,
            },
          ],
        });
      expect(cnRes.status).toBe(201);
      const creditNote = cnRes.body.data;
      expect(creditNote.invoiceType).toBe('CREDIT_NOTE');
      expect(creditNote.referenceNo).toMatch(/^CRN-/);
      expect(Number(creditNote.totalAmount)).toBe(230);

      // Verify Credit Note ZATCA XML (TypeCode 381, BillingReference, InstructionNote, ICV = 3, PIH = invoice #2's xmlHash)
      const cnZatcaRes = await request
        .get(`/api/invoices/${creditNote.id}/zatca`)
        .set(authHeader(org.accessToken));
      expect(cnZatcaRes.status).toBe(200);
      expect(cnZatcaRes.body.data.icv).toBe(3);
      expect(cnZatcaRes.body.data.pih).toBe(zatca.xmlHash);
      expect(cnZatcaRes.body.data.chainValid).toBe(true);
      expect(cnZatcaRes.body.data.zatcaXml).toContain(
        '<cbc:InvoiceTypeCode name="0200000">381</cbc:InvoiceTypeCode>'
      );
      expect(cnZatcaRes.body.data.zatcaXml).toContain('<cac:BillingReference>');
      expect(cnZatcaRes.body.data.zatcaXml).toContain(
        '<cbc:InstructionNote>خصم متفق عليه بعد الإصدار لتسوية الملاحظات</cbc:InstructionNote>'
      );

      // Verify original invoice's historical totalAmount is untouched (1150), while remainingAmount is reduced by 230 -> 920
      const origAfterCn = await request
        .get(`/api/invoices/${invId}`)
        .set(authHeader(org.accessToken));
      expect(Number(origAfterCn.body.data.totalAmount)).toBe(1150);
      expect(Number(origAfterCn.body.data.remainingAmount)).toBe(920);
      expect(origAfterCn.body.data.relatedNotes.length).toBe(1);
      expect(origAfterCn.body.data.relatedNotes[0].id).toBe(creditNote.id);
    });
  });

  describe('4. Payments, Client Outstanding Balance & Reversal Rules', () => {
    it('updates client outstandingBalance accurately across partial payments and payment reversals', async () => {
      // Check B2C client's outstanding balance (920 SAR remaining on the invoice after the 230 SAR Credit Note)
      const clientBeforePay = await request
        .get(`/api/clients/${clientB2CId}`)
        .set(authHeader(org.accessToken));
      expect(Number(clientBeforePay.body.data.stats.outstandingBalance)).toBe(920);

      const origInvoice = clientBeforePay.body.data.invoices.find(
        (i: any) => i.invoiceType === 'SIMPLIFIED_TAX_INVOICE' && i.status === 'APPROVED'
      );
      const invId = origInvoice.id;

      // Record partial payment of 400 SAR
      const pay1Res = await request
        .post('/api/payments')
        .set(authHeader(org.accessToken))
        .send({
          invoiceId: invId,
          paymentDate: '2026-10-19',
          amount: 400,
          method: 'BANK_TRANSFER',
          referenceNo: 'BANK-REF-9001',
        });
      expect(pay1Res.status).toBe(201);
      const pay1Id = pay1Res.body.data.id;

      // Cannot cancel an invoice that has recorded payments
      const cancelWithPaymentRes = await request
        .post(`/api/invoices/${invId}/cancel`)
        .set(authHeader(org.accessToken))
        .send({ cancellationReason: 'محاولة إلغاء فاتورة مدفوعة جزئياً' });
      expect(cancelWithPaymentRes.status).toBe(422);

      // Verify client's outstanding balance is now 920 - 400 = 520 SAR
      const clientAfterPay = await request
        .get(`/api/clients/${clientB2CId}`)
        .set(authHeader(org.accessToken));
      expect(Number(clientAfterPay.body.data.stats.outstandingBalance)).toBe(520);

      // Delete/reverse the payment within 24h window
      const delPayRes = await request
        .delete(`/api/payments/${pay1Id}`)
        .set(authHeader(org.accessToken));
      expect(delPayRes.status).toBe(200);

      // Verify balance is restored to 920 SAR
      const clientAfterReverse = await request
        .get(`/api/clients/${clientB2CId}`)
        .set(authHeader(org.accessToken));
      expect(Number(clientAfterReverse.body.data.stats.outstandingBalance)).toBe(920);
    });
  });
});
