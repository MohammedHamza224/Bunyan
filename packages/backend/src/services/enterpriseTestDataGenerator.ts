import { Prisma } from '@prisma/client';

export interface TrackedRecord {
  entityType: string;
  entityId: string;
  referenceNo?: string | null;
  entityName?: string | null;
}

/**
 * Generates the comprehensive 6-customer construction enterprise dataset.
 */
export async function generateEnterpriseSixCustomers(
  tx: Prisma.TransactionClient,
  organizationId: string,
  userId: string,
  dataset: { id: string },
  defaultBank: { id: string } | undefined,
  orgSnapshot: any,
  recordsToTrack: TrackedRecord[]
) {
  const dsSuffix = dataset.id.slice(-5);
  const now = new Date();

  // =========================================================================
  // CUSTOMER 1: شركة الأفق للمقاولات - TEST
  // Multi-project, multi-statement, multi-invoice, multi-payment
  // =========================================================================
  const c1 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'شركة الأفق للمقاولات - TEST',
      nameEn: 'Horizon Contracting Co. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310111111100003',
      phone: '0501112233',
      email: `contact.${dsSuffix}@horizon-test.example.com`,
      address: 'الرياض - طريق الملك فهد - حي الصحافة',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل تجريبي لاختبار دورة مقاولات متكاملة وحسابات جارية`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c1.id, referenceNo: c1.id, entityName: c1.nameAr });

  // 3 Sites for C1
  const s1_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c1.id,
      nameAr: 'مشروع برج الأفق التجاري - TEST',
      nameEn: 'Horizon Commercial Tower - TEST',
      referenceNo: `SITE-HRZ-01-${dsSuffix}`,
      description: 'إنشاء برج مكاتب تجاري مكون من 14 طابقاً وقبوين',
      status: 'ACTIVE',
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-12-30'),
      address: 'الرياض - طريق العليا',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s1_1.id, referenceNo: s1_1.referenceNo || s1_1.id, entityName: s1_1.nameAr });

  const s1_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c1.id,
      nameAr: 'مشروع مجمع فلل الياسمين - TEST',
      nameEn: 'Al-Yasmeen Villas Compound - TEST',
      referenceNo: `SITE-HRZ-02-${dsSuffix}`,
      description: 'إنشاء وتشطيب 8 فلل سكنية فاخرة',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-10-15'),
      address: 'الرياض - حي الياسمين',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s1_2.id, referenceNo: s1_2.referenceNo || s1_2.id, entityName: s1_2.nameAr });

  const s1_3 = await tx.site.create({
    data: {
      organizationId,
      clientId: c1.id,
      nameAr: 'مشروع تطوير البنية التحتية والمواقف - TEST',
      nameEn: 'Infrastructure & Parking Works - TEST',
      referenceNo: `SITE-HRZ-03-${dsSuffix}`,
      description: 'أعمال تسوية ورصف وإنارة مواقف سيارات خارجية',
      status: 'ACTIVE',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-06-30'),
      address: 'الرياض - حي الصحافة',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s1_3.id, referenceNo: s1_3.referenceNo || s1_3.id, entityName: s1_3.nameAr });

  // 8 Work entries for C1
  const we1_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_1.id,
      referenceNo: `WRK-HRZ-01-${dsSuffix}`,
      itemNameAr: 'أعمال حفر الموقع العام وتسوية المنسوب',
      itemNameEn: 'General excavation and site grading',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 600,
      unitPrice: 45,
      totalAmount: 27000,
      billedQuantity: 600,
      workDate: new Date('2026-01-10'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-11'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_1.id, referenceNo: we1_1.referenceNo, entityName: we1_1.itemNameAr });

  const we1_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_1.id,
      referenceNo: `WRK-HRZ-02-${dsSuffix}`,
      itemNameAr: 'صب خرسانة نظافة وقواعد شريطية مسلحة',
      itemNameEn: 'Reinforced strip footings and foundation concrete',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 150,
      unitPrice: 340,
      totalAmount: 51000,
      billedQuantity: 150,
      workDate: new Date('2026-01-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_2.id, referenceNo: we1_2.referenceNo, entityName: we1_2.itemNameAr });

  const we1_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_1.id,
      referenceNo: `WRK-HRZ-03-${dsSuffix}`,
      itemNameAr: 'عزل مائي بيتوميني مزدوج للأساسات والجدران الساندة',
      itemNameEn: 'Double-layer bituminous foundation waterproofing',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 320,
      unitPrice: 50,
      totalAmount: 16000,
      billedQuantity: 320,
      workDate: new Date('2026-01-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_3.id, referenceNo: we1_3.referenceNo, entityName: we1_3.itemNameAr });

  const we1_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_2.id,
      referenceNo: `WRK-HRZ-04-${dsSuffix}`,
      itemNameAr: 'توريد وتركيب مجاري تكييف دكت مجلفن للفلل',
      itemNameEn: 'Galvanized HVAC ductwork installation',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 200,
      unitPrice: 120,
      totalAmount: 24000,
      billedQuantity: 200,
      workDate: new Date('2026-02-05'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-06'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_4.id, referenceNo: we1_4.referenceNo, entityName: we1_4.itemNameAr });

  const we1_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_2.id,
      referenceNo: `WRK-HRZ-05-${dsSuffix}`,
      itemNameAr: 'أعمال تمديد مواسير الصرف والتغذية PPR المعزولة',
      itemNameEn: 'PPR water supply and drainage pipework',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 180,
      unitPrice: 100,
      totalAmount: 18000,
      billedQuantity: 180,
      workDate: new Date('2026-02-10'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-11'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_5.id, referenceNo: we1_5.referenceNo, entityName: we1_5.itemNameAr });

  const we1_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_3.id,
      referenceNo: `WRK-HRZ-06-${dsSuffix}`,
      itemNameAr: 'أعمال رصف إنترلوك للساحات والممرات الخارجية',
      itemNameEn: 'Interlocking concrete pavers for driveways',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 400,
      unitPrice: 70,
      totalAmount: 28000,
      billedQuantity: 0,
      workDate: new Date('2026-02-15'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_6.id, referenceNo: we1_6.referenceNo, entityName: we1_6.itemNameAr });

  const we1_7 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_3.id,
      referenceNo: `WRK-HRZ-07-${dsSuffix}`,
      itemNameAr: 'تركيب أعمدة إنارة ومصابيح LED خارجية موفرة للطاقة',
      itemNameEn: 'Exterior LED lighting poles installation',
      unit: 'قطعة',
      unitEn: 'PCS',
      quantity: 10,
      unitPrice: 1200,
      totalAmount: 12000,
      billedQuantity: 0,
      workDate: new Date('2026-02-18'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-19'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_7.id, referenceNo: we1_7.referenceNo, entityName: we1_7.itemNameAr });

  const we1_8 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c1.id,
      siteId: s1_1.id,
      referenceNo: `WRK-HRZ-08-${dsSuffix}`,
      itemNameAr: 'خدمات إشراف هندسي وضبط جودة لمرحلة الأساسات',
      itemNameEn: 'Engineering supervision and QA services',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 15000,
      totalAmount: 15000,
      billedQuantity: 1,
      workDate: new Date('2026-02-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we1_8.id, referenceNo: we1_8.referenceNo, entityName: we1_8.itemNameAr });

  // Statements for C1
  const stm1_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c1.id,
      referenceNo: `STM-HRZ-01-${dsSuffix}`,
      title: 'مستخلص الأعمال الإنشائية والأساسات - برج الأفق',
      issueDate: new Date('2026-01-25'),
      periodStart: new Date('2026-01-05'),
      periodEnd: new Date('2026-01-24'),
      orgSnapshot,
      subtotal: 94000,
      discountAmount: 0,
      taxableAmount: 94000,
      vatRate: 15,
      vatAmount: 14100,
      totalAmount: 108100,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s1_1.id }] },
      lines: {
        create: [
          { workEntryId: we1_1.id, itemNameAr: we1_1.itemNameAr, itemNameEn: we1_1.itemNameEn, unit: we1_1.unit, approvedQuantity: 600, unitPrice: 45, lineTotal: 27000, sortOrder: 0 },
          { workEntryId: we1_2.id, itemNameAr: we1_2.itemNameAr, itemNameEn: we1_2.itemNameEn, unit: we1_2.unit, approvedQuantity: 150, unitPrice: 340, lineTotal: 51000, sortOrder: 1 },
          { workEntryId: we1_3.id, itemNameAr: we1_3.itemNameAr, itemNameEn: we1_3.itemNameEn, unit: we1_3.unit, approvedQuantity: 320, unitPrice: 50, lineTotal: 16000, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm1_1.id, referenceNo: stm1_1.referenceNo, entityName: stm1_1.title });

  const stm1_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c1.id,
      referenceNo: `STM-HRZ-02-${dsSuffix}`,
      title: 'مستخلص الأعمال الكهروميكانيكية - فلل الياسمين',
      issueDate: new Date('2026-02-12'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-11'),
      orgSnapshot,
      subtotal: 42000,
      discountAmount: 0,
      taxableAmount: 42000,
      vatRate: 15,
      vatAmount: 6300,
      totalAmount: 48300,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-13'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s1_2.id }] },
      lines: {
        create: [
          { workEntryId: we1_4.id, itemNameAr: we1_4.itemNameAr, itemNameEn: we1_4.itemNameEn, unit: we1_4.unit, approvedQuantity: 200, unitPrice: 120, lineTotal: 24000, sortOrder: 0 },
          { workEntryId: we1_5.id, itemNameAr: we1_5.itemNameAr, itemNameEn: we1_5.itemNameEn, unit: we1_5.unit, approvedQuantity: 180, unitPrice: 100, lineTotal: 18000, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm1_2.id, referenceNo: stm1_2.referenceNo, entityName: stm1_2.title });

  const stm1_3 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c1.id,
      referenceNo: `STM-HRZ-03-${dsSuffix}`,
      title: 'مستخلص أعمال البنية التحتية والإنارة الخارجية - معتمد وبانتظار الفوترة',
      issueDate: new Date('2026-02-22'),
      periodStart: new Date('2026-02-15'),
      periodEnd: new Date('2026-02-21'),
      orgSnapshot,
      subtotal: 40000,
      discountAmount: 0,
      taxableAmount: 40000,
      vatRate: 15,
      vatAmount: 6000,
      totalAmount: 46000,
      status: 'APPROVED', // Eligible for invoicing
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-23'),
      notes: `[TEST_DATASET:${dataset.id}] مستخلص معتمد جاهز لإصدار الفاتورة`,
      sites: { create: [{ siteId: s1_3.id }] },
      lines: {
        create: [
          { workEntryId: we1_6.id, itemNameAr: we1_6.itemNameAr, itemNameEn: we1_6.itemNameEn, unit: we1_6.unit, approvedQuantity: 400, unitPrice: 70, lineTotal: 28000, sortOrder: 0 },
          { workEntryId: we1_7.id, itemNameAr: we1_7.itemNameAr, itemNameEn: we1_7.itemNameEn, unit: we1_7.unit, approvedQuantity: 10, unitPrice: 1200, lineTotal: 12000, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm1_3.id, referenceNo: stm1_3.referenceNo, entityName: stm1_3.title });

  const c1Snapshot = { nameAr: c1.nameAr, nameEn: c1.nameEn, clientType: c1.clientType, vatNumber: c1.vatNumber, address: c1.address, phone: c1.phone, email: c1.email };

  // Invoices for C1
  const inv1_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c1.id,
      statementId: stm1_1.id,
      referenceNo: `INV-HRZ-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-01-28'),
      dueDate: new Date('2026-02-28'),
      supplyDate: new Date('2026-01-25'),
      orgSnapshot,
      clientSnapshot: c1Snapshot,
      subtotal: 94000,
      discountAmount: 0,
      taxableAmount: 94000,
      vatRate: 15,
      vatAmount: 14100,
      totalAmount: 108100,
      paidAmount: 108100,
      remainingAmount: 0,
      status: 'APPROVED',
      paymentStatus: 'PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسددة بالكامل بدفعتين`,
      lines: {
        create: [
          { workEntryId: we1_1.id, itemNameAr: we1_1.itemNameAr, itemNameEn: we1_1.itemNameEn, unit: we1_1.unit, quantity: 600, unitPrice: 45, lineSubtotal: 27000, vatRate: 15, vatAmount: 4050, lineTotal: 31050, sortOrder: 0 },
          { workEntryId: we1_2.id, itemNameAr: we1_2.itemNameAr, itemNameEn: we1_2.itemNameEn, unit: we1_2.unit, quantity: 150, unitPrice: 340, lineSubtotal: 51000, vatRate: 15, vatAmount: 7650, lineTotal: 58650, sortOrder: 1 },
          { workEntryId: we1_3.id, itemNameAr: we1_3.itemNameAr, itemNameEn: we1_3.itemNameEn, unit: we1_3.unit, quantity: 320, unitPrice: 50, lineSubtotal: 16000, vatRate: 15, vatAmount: 2400, lineTotal: 18400, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv1_1.id, referenceNo: inv1_1.referenceNo, entityName: `فاتورة ${inv1_1.referenceNo}` });

  const inv1_2 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c1.id,
      statementId: stm1_2.id,
      referenceNo: `INV-HRZ-02-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-14'),
      dueDate: new Date('2026-03-16'),
      supplyDate: new Date('2026-02-12'),
      orgSnapshot,
      clientSnapshot: c1Snapshot,
      subtotal: 42000,
      discountAmount: 0,
      taxableAmount: 42000,
      vatRate: 15,
      vatAmount: 6300,
      totalAmount: 48300,
      paidAmount: 25000,
      remainingAmount: 23300,
      status: 'APPROVED',
      paymentStatus: 'PARTIALLY_PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسددة جزئياً`,
      lines: {
        create: [
          { workEntryId: we1_4.id, itemNameAr: we1_4.itemNameAr, itemNameEn: we1_4.itemNameEn, unit: we1_4.unit, quantity: 200, unitPrice: 120, lineSubtotal: 24000, vatRate: 15, vatAmount: 3600, lineTotal: 27600, sortOrder: 0 },
          { workEntryId: we1_5.id, itemNameAr: we1_5.itemNameAr, itemNameEn: we1_5.itemNameEn, unit: we1_5.unit, quantity: 180, unitPrice: 100, lineSubtotal: 18000, vatRate: 15, vatAmount: 2700, lineTotal: 20700, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv1_2.id, referenceNo: inv1_2.referenceNo, entityName: `فاتورة ${inv1_2.referenceNo}` });

  const inv1_3 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c1.id,
      statementId: null,
      referenceNo: `INV-HRZ-03-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-25'),
      dueDate: new Date('2026-03-27'),
      supplyDate: new Date('2026-02-20'),
      orgSnapshot,
      clientSnapshot: c1Snapshot,
      subtotal: 15000,
      discountAmount: 0,
      taxableAmount: 15000,
      vatRate: 15,
      vatAmount: 2250,
      totalAmount: 17250,
      paidAmount: 0,
      remainingAmount: 17250,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة إشراف مباشر غير مسددة`,
      lines: {
        create: [
          { workEntryId: we1_8.id, itemNameAr: we1_8.itemNameAr, itemNameEn: we1_8.itemNameEn, unit: we1_8.unit, quantity: 1, unitPrice: 15000, lineSubtotal: 15000, vatRate: 15, vatAmount: 2250, lineTotal: 17250, sortOrder: 0 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv1_3.id, referenceNo: inv1_3.referenceNo, entityName: `فاتورة ${inv1_3.referenceNo}` });

  // Payments for C1 (3 Payments: PAY1_1 + PAY1_2 on INV1_1, PAY1_3 on INV1_2)
  const pay1_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c1.id,
      invoiceId: inv1_1.id,
      referenceNo: `PAY-HRZ-01A-${dsSuffix}`,
      paymentDate: new Date('2026-02-02'),
      amount: 60000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'مصرف الراجحي',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-02T11:00:00Z'),
      idempotencyKey: `idemp-c1-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة أولى تحويل مصرفي`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay1_1.id, referenceNo: pay1_1.referenceNo || pay1_1.id, entityName: `سند قبض ${pay1_1.referenceNo}` });

  const pay1_2 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c1.id,
      invoiceId: inv1_1.id,
      referenceNo: `PAY-HRZ-01B-${dsSuffix}`,
      paymentDate: new Date('2026-02-10'),
      amount: 48100,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'مصرف الراجحي',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-10T14:30:00Z'),
      idempotencyKey: `idemp-c1-2-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] تسوية نهائية للفاتورة الأولى`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay1_2.id, referenceNo: pay1_2.referenceNo || pay1_2.id, entityName: `سند قبض ${pay1_2.referenceNo}` });

  const pay1_3 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c1.id,
      invoiceId: inv1_2.id,
      referenceNo: `PAY-HRZ-02-${dsSuffix}`,
      paymentDate: new Date('2026-02-20'),
      amount: 25000,
      method: 'CHEQUE',
      chequeNumber: `CHQ-${dsSuffix}-101`,
      chequeDate: new Date('2026-02-20'),
      bankAccountId: defaultBank?.id || null,
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-20T10:00:00Z'),
      idempotencyKey: `idemp-c1-3-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة شيك للفاتورة الثانية`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay1_3.id, referenceNo: pay1_3.referenceNo || pay1_3.id, entityName: `سند قبض ${pay1_3.referenceNo}` });

  // =========================================================================
  // CUSTOMER 2: مؤسسة البناء الحديث - TEST
  // Fully paid & completely unpaid invoices (Scenarios A & C)
  // =========================================================================
  const c2 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'مؤسسة البناء الحديث - TEST',
      nameEn: 'Modern Building Est. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310222222200003',
      phone: '0502223344',
      email: `info.${dsSuffix}@modern-build-test.example.com`,
      address: 'جدة - طريق المدينة المنورة - حي البوادي',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل لاختبار الفواتير المسددة بالكامل وغير المسددة`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c2.id, referenceNo: c2.id, entityName: c2.nameAr });

  // 3 Sites for C2
  const s2_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c2.id,
      nameAr: 'مشروع مستودعات الخمرة اللوجستية - TEST',
      nameEn: 'Al-Khumra Logistics Warehouses - TEST',
      referenceNo: `SITE-MOD-01-${dsSuffix}`,
      description: 'إنشاء 4 مستودعات تخزين بارد وجاف مع ساحات تحميل',
      status: 'ACTIVE',
      startDate: new Date('2026-01-10'),
      endDate: new Date('2026-09-30'),
      address: 'جدة - منطقة الخمرة الصناعية',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s2_1.id, referenceNo: s2_1.referenceNo || s2_1.id, entityName: s2_1.nameAr });

  const s2_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c2.id,
      nameAr: 'مشروع صالة العرض والمكاتب الإدارية - TEST',
      nameEn: 'Commercial Showroom & Offices - TEST',
      referenceNo: `SITE-MOD-02-${dsSuffix}`,
      description: 'تشطيب صالة عرض سيارات ومكاتب ميزانين',
      status: 'ACTIVE',
      startDate: new Date('2026-01-20'),
      endDate: new Date('2026-08-15'),
      address: 'جدة - حي البوادي',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s2_2.id, referenceNo: s2_2.referenceNo || s2_2.id, entityName: s2_2.nameAr });

  const s2_3 = await tx.site.create({
    data: {
      organizationId,
      clientId: c2.id,
      nameAr: 'مشروع سكن العمال والمرافق الخدمية - TEST',
      nameEn: 'Staff Housing & Utilities - TEST',
      referenceNo: `SITE-MOD-03-${dsSuffix}`,
      description: 'تشطيب مبنى سكن مكون من 3 طوابق مع مطابخ مركزية',
      status: 'ACTIVE',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-07-30'),
      address: 'جدة - عسفان',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s2_3.id, referenceNo: s2_3.referenceNo || s2_3.id, entityName: s2_3.nameAr });

  // 7 Work Entries for C2
  const we2_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_1.id,
      referenceNo: `WRK-MOD-01-${dsSuffix}`,
      itemNameAr: 'توريد وتركيب جملونات وهياكل حديد صلب ثقيل',
      itemNameEn: 'Heavy structural steel trusses supply and erection',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 450,
      unitPrice: 160,
      totalAmount: 72000,
      billedQuantity: 450,
      workDate: new Date('2026-01-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_1.id, referenceNo: we2_1.referenceNo, entityName: we2_1.itemNameAr });

  const we2_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_1.id,
      referenceNo: `WRK-MOD-02-${dsSuffix}`,
      itemNameAr: 'تركيب ألواح صاج ساندوتش بانل معزول 10 سم للأسقف',
      itemNameEn: '10cm insulated sandwich panel roof installation',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 350,
      unitPrice: 80,
      totalAmount: 28000,
      billedQuantity: 350,
      workDate: new Date('2026-01-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_2.id, referenceNo: we2_2.referenceNo, entityName: we2_2.itemNameAr });

  const we2_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_2.id,
      referenceNo: `WRK-MOD-03-${dsSuffix}`,
      itemNameAr: 'واجهات زجاجية استركشر وأبواب سيكوريت 12 مم',
      itemNameEn: 'Structural glazing facades and 12mm tempered glass doors',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 80,
      unitPrice: 450,
      totalAmount: 36000,
      billedQuantity: 80,
      workDate: new Date('2026-02-01'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-02'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_3.id, referenceNo: we2_3.referenceNo, entityName: we2_3.itemNameAr });

  const we2_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_2.id,
      referenceNo: `WRK-MOD-04-${dsSuffix}`,
      itemNameAr: 'أعمال تجليد ألمنيوم كلادينج مقاوم للحريق للواجهات',
      itemNameEn: 'Fire-rated aluminum composite panel cladding',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 120,
      unitPrice: 200,
      totalAmount: 24000,
      billedQuantity: 120,
      workDate: new Date('2026-02-08'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-09'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_4.id, referenceNo: we2_4.referenceNo, entityName: we2_4.itemNameAr });

  const we2_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_3.id,
      referenceNo: `WRK-MOD-05-${dsSuffix}`,
      itemNameAr: 'أعمال دهانات بلاستيكية داخلية ثلاث أوجه مع المعجون',
      itemNameEn: 'Three-coat interior plastic emulsion paint',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 500,
      unitPrice: 25,
      totalAmount: 12500,
      billedQuantity: 0,
      workDate: new Date('2026-02-15'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_5.id, referenceNo: we2_5.referenceNo, entityName: we2_5.itemNameAr });

  const we2_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_3.id,
      referenceNo: `WRK-MOD-06-${dsSuffix}`,
      itemNameAr: 'تركيب بلاط سيراميك نخب أول للأرضيات والممرات',
      itemNameEn: 'First-class ceramic floor tiling',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 250,
      unitPrice: 50,
      totalAmount: 12500,
      billedQuantity: 0,
      workDate: new Date('2026-02-18'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-19'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_6.id, referenceNo: we2_6.referenceNo, entityName: we2_6.itemNameAr });

  const we2_7 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c2.id,
      siteId: s2_1.id,
      referenceNo: `WRK-MOD-07-${dsSuffix}`,
      itemNameAr: 'توريد وتركيب بوابات منزلقة آلية مع محركات إيطالية',
      itemNameEn: 'Automated sliding steel gates with Italian motors',
      unit: 'قطعة',
      unitEn: 'PCS',
      quantity: 2,
      unitPrice: 10000,
      totalAmount: 20000,
      billedQuantity: 2,
      workDate: new Date('2026-02-22'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-23'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we2_7.id, referenceNo: we2_7.referenceNo, entityName: we2_7.itemNameAr });

  // 2 Statements for C2
  const stm2_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c2.id,
      referenceNo: `STM-MOD-01-${dsSuffix}`,
      title: 'مستخلص أعمال الهياكل والتغطيات - مستودعات الخمرة',
      issueDate: new Date('2026-01-25'),
      periodStart: new Date('2026-01-10'),
      periodEnd: new Date('2026-01-24'),
      orgSnapshot,
      subtotal: 100000,
      discountAmount: 0,
      taxableAmount: 100000,
      vatRate: 15,
      vatAmount: 15000,
      totalAmount: 115000,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s2_1.id }] },
      lines: {
        create: [
          { workEntryId: we2_1.id, itemNameAr: we2_1.itemNameAr, itemNameEn: we2_1.itemNameEn, unit: we2_1.unit, approvedQuantity: 450, unitPrice: 160, lineTotal: 72000, sortOrder: 0 },
          { workEntryId: we2_2.id, itemNameAr: we2_2.itemNameAr, itemNameEn: we2_2.itemNameEn, unit: we2_2.unit, approvedQuantity: 350, unitPrice: 80, lineTotal: 28000, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm2_1.id, referenceNo: stm2_1.referenceNo, entityName: stm2_1.title });

  const stm2_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c2.id,
      referenceNo: `STM-MOD-02-${dsSuffix}`,
      title: 'مستخلص واجهات الزجاج والكلادينج - صالة العرض',
      issueDate: new Date('2026-02-12'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-11'),
      orgSnapshot,
      subtotal: 60000,
      discountAmount: 0,
      taxableAmount: 60000,
      vatRate: 15,
      vatAmount: 9000,
      totalAmount: 69000,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-13'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s2_2.id }] },
      lines: {
        create: [
          { workEntryId: we2_3.id, itemNameAr: we2_3.itemNameAr, itemNameEn: we2_3.itemNameEn, unit: we2_3.unit, approvedQuantity: 80, unitPrice: 450, lineTotal: 36000, sortOrder: 0 },
          { workEntryId: we2_4.id, itemNameAr: we2_4.itemNameAr, itemNameEn: we2_4.itemNameEn, unit: we2_4.unit, approvedQuantity: 120, unitPrice: 200, lineTotal: 24000, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm2_2.id, referenceNo: stm2_2.referenceNo, entityName: stm2_2.title });

  const c2Snapshot = { nameAr: c2.nameAr, nameEn: c2.nameEn, clientType: c2.clientType, vatNumber: c2.vatNumber, address: c2.address, phone: c2.phone, email: c2.email };

  // 3 Invoices for C2
  const inv2_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c2.id,
      statementId: stm2_1.id,
      referenceNo: `INV-MOD-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-01-28'),
      dueDate: new Date('2026-02-28'),
      supplyDate: new Date('2026-01-25'),
      orgSnapshot,
      clientSnapshot: c2Snapshot,
      subtotal: 100000,
      discountAmount: 0,
      taxableAmount: 100000,
      vatRate: 15,
      vatAmount: 15000,
      totalAmount: 115000,
      paidAmount: 115000,
      remainingAmount: 0,
      status: 'APPROVED',
      paymentStatus: 'PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسددة بالكامل (Scenario A)`,
      lines: {
        create: [
          { workEntryId: we2_1.id, itemNameAr: we2_1.itemNameAr, itemNameEn: we2_1.itemNameEn, unit: we2_1.unit, quantity: 450, unitPrice: 160, lineSubtotal: 72000, vatRate: 15, vatAmount: 10800, lineTotal: 82800, sortOrder: 0 },
          { workEntryId: we2_2.id, itemNameAr: we2_2.itemNameAr, itemNameEn: we2_2.itemNameEn, unit: we2_2.unit, quantity: 350, unitPrice: 80, lineSubtotal: 28000, vatRate: 15, vatAmount: 4200, lineTotal: 32200, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv2_1.id, referenceNo: inv2_1.referenceNo, entityName: `فاتورة ${inv2_1.referenceNo}` });

  const inv2_2 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c2.id,
      statementId: stm2_2.id,
      referenceNo: `INV-MOD-02-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-15'),
      dueDate: new Date('2026-03-17'),
      supplyDate: new Date('2026-02-12'),
      orgSnapshot,
      clientSnapshot: c2Snapshot,
      subtotal: 60000,
      discountAmount: 0,
      taxableAmount: 60000,
      vatRate: 15,
      vatAmount: 9000,
      totalAmount: 69000,
      paidAmount: 0,
      remainingAmount: 69000,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة غير مسددة بالكامل (Scenario C)`,
      lines: {
        create: [
          { workEntryId: we2_3.id, itemNameAr: we2_3.itemNameAr, itemNameEn: we2_3.itemNameEn, unit: we2_3.unit, quantity: 80, unitPrice: 450, lineSubtotal: 36000, vatRate: 15, vatAmount: 5400, lineTotal: 41400, sortOrder: 0 },
          { workEntryId: we2_4.id, itemNameAr: we2_4.itemNameAr, itemNameEn: we2_4.itemNameEn, unit: we2_4.unit, quantity: 120, unitPrice: 200, lineSubtotal: 24000, vatRate: 15, vatAmount: 3600, lineTotal: 27600, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv2_2.id, referenceNo: inv2_2.referenceNo, entityName: `فاتورة ${inv2_2.referenceNo}` });

  const inv2_3 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c2.id,
      statementId: null,
      referenceNo: `INV-MOD-03-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-25'),
      dueDate: new Date('2026-03-27'),
      supplyDate: new Date('2026-02-22'),
      orgSnapshot,
      clientSnapshot: c2Snapshot,
      subtotal: 20000,
      discountAmount: 0,
      taxableAmount: 20000,
      vatRate: 15,
      vatAmount: 3000,
      totalAmount: 23000,
      paidAmount: 0,
      remainingAmount: 23000,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مباشرة غير مسددة (Scenario C)`,
      lines: {
        create: [
          { workEntryId: we2_7.id, itemNameAr: we2_7.itemNameAr, itemNameEn: we2_7.itemNameEn, unit: we2_7.unit, quantity: 2, unitPrice: 10000, lineSubtotal: 20000, vatRate: 15, vatAmount: 3000, lineTotal: 23000, sortOrder: 0 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv2_3.id, referenceNo: inv2_3.referenceNo, entityName: `فاتورة ${inv2_3.referenceNo}` });

  // 1 Payment for C2 (Full payment of INV2_1)
  const pay2_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c2.id,
      invoiceId: inv2_1.id,
      referenceNo: `PAY-MOD-01-${dsSuffix}`,
      paymentDate: new Date('2026-02-05'),
      amount: 115000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'البنك الأهلي السعودي',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-05T12:00:00Z'),
      idempotencyKey: `idemp-c2-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] سداد كامل الفاتورة الأولى بموجب حوالة سريعة`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay2_1.id, referenceNo: pay2_1.referenceNo || pay2_1.id, entityName: `سند قبض ${pay2_1.referenceNo}` });

  // =========================================================================
  // CUSTOMER 3: شركة إعمار الشرقية - TEST
  // Partial payments and remaining balances (Scenario B) & Discounted statement
  // =========================================================================
  const c3 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'شركة إعمار الشرقية - TEST',
      nameEn: 'Eastern Emaar Co. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310333333300003',
      phone: '0503334455',
      email: `finance.${dsSuffix}@eastern-emaar-test.example.com`,
      address: 'الدمام - حي الشاطئ الشرقي',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل لاختبار السداد الجزئي والخصومات التعاقدية`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c3.id, referenceNo: c3.id, entityName: c3.nameAr });

  // 2 Sites for C3
  const s3_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c3.id,
      nameAr: 'مشروع مجمع الفنار الطبي - TEST',
      nameEn: 'Al-Fanar Medical Center - TEST',
      referenceNo: `SITE-EMR-01-${dsSuffix}`,
      description: 'تشطيب وتجهيز مجمع عيادات ومختبرات تخصصية',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-11-20'),
      address: 'الدمام - طريق الخليج',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s3_1.id, referenceNo: s3_1.referenceNo || s3_1.id, entityName: s3_1.nameAr });

  const s3_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c3.id,
      nameAr: 'مشروع ترميم وتجديد مبنى الإدارة - TEST',
      nameEn: 'HQ Administrative Building Renovation - TEST',
      referenceNo: `SITE-EMR-02-${dsSuffix}`,
      description: 'أعمال تجديد معمارية وشبكات داخلية للمبنى الإداري',
      status: 'ACTIVE',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-06-30'),
      address: 'الخبر - الحزام الذهبي',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s3_2.id, referenceNo: s3_2.referenceNo || s3_2.id, entityName: s3_2.nameAr });

  // 6 Work Entries for C3
  const we3_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_1.id,
      referenceNo: `WRK-EMR-01-${dsSuffix}`,
      itemNameAr: 'أعمال قواطع جبس بورد طبي مضاد للبكتيريا والرطوبة',
      itemNameEn: 'Anti-bacterial gypsum board medical partitions',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 300,
      unitPrice: 90,
      totalAmount: 27000,
      billedQuantity: 300,
      workDate: new Date('2026-01-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_1.id, referenceNo: we3_1.referenceNo, entityName: we3_1.itemNameAr });

  const we3_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_1.id,
      referenceNo: `WRK-EMR-02-${dsSuffix}`,
      itemNameAr: 'توريد وتركيب أرضيات فينيل طبي موصل للشحنات الاستاتيكية',
      itemNameEn: 'Conductive medical vinyl flooring',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 200,
      unitPrice: 130,
      totalAmount: 26000,
      billedQuantity: 200,
      workDate: new Date('2026-01-25'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_2.id, referenceNo: we3_2.referenceNo, entityName: we3_2.itemNameAr });

  const we3_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_1.id,
      referenceNo: `WRK-EMR-03-${dsSuffix}`,
      itemNameAr: 'تمديد واختبار شبكة الغازات الطبية ووحدات إنذار الضغط',
      itemNameEn: 'Medical gas pipeline system and pressure alarms',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 35000,
      totalAmount: 35000,
      billedQuantity: 1,
      workDate: new Date('2026-02-01'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-02'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_3.id, referenceNo: we3_3.referenceNo, entityName: we3_3.itemNameAr });

  const we3_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_2.id,
      referenceNo: `WRK-EMR-04-${dsSuffix}`,
      itemNameAr: 'أعمال تكسير وإزالة القواطع القديمة وترحيل الأنقاض',
      itemNameEn: 'Internal demolition, partition removal and debris disposal',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 18000,
      totalAmount: 18000,
      billedQuantity: 1,
      workDate: new Date('2026-02-05'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-06'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_4.id, referenceNo: we3_4.referenceNo, entityName: we3_4.itemNameAr });

  const we3_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_2.id,
      referenceNo: `WRK-EMR-05-${dsSuffix}`,
      itemNameAr: 'تركيب أسقف مستعارة معلقة معدنية 60×60 سم للمكاتب',
      itemNameEn: 'Suspended metal ceiling tiles 60x60cm',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 250,
      unitPrice: 80,
      totalAmount: 20000,
      billedQuantity: 250,
      workDate: new Date('2026-02-10'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-11'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_5.id, referenceNo: we3_5.referenceNo, entityName: we3_5.itemNameAr });

  const we3_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c3.id,
      siteId: s3_2.id,
      referenceNo: `WRK-EMR-06-${dsSuffix}`,
      itemNameAr: 'أعمال تجديد الشبكة الصحية الداخلية وتركيب الأطقم الفاخرة',
      itemNameEn: 'Sanitary plumbing overhaul and luxury fixture installation',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 22000,
      totalAmount: 22000,
      billedQuantity: 1,
      workDate: new Date('2026-02-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we3_6.id, referenceNo: we3_6.referenceNo, entityName: we3_6.itemNameAr });

  // 2 Statements for C3 (one with discount)
  const stm3_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c3.id,
      referenceNo: `STM-EMR-01-${dsSuffix}`,
      title: 'مستخلص أعمال التجديد الداخلي - مبنى الإدارة',
      issueDate: new Date('2026-02-18'),
      periodStart: new Date('2026-02-05'),
      periodEnd: new Date('2026-02-17'),
      orgSnapshot,
      subtotal: 60000,
      discountAmount: 0,
      taxableAmount: 60000,
      vatRate: 15,
      vatAmount: 9000,
      totalAmount: 69000,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-19'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s3_2.id }] },
      lines: {
        create: [
          { workEntryId: we3_4.id, itemNameAr: we3_4.itemNameAr, itemNameEn: we3_4.itemNameEn, unit: we3_4.unit, approvedQuantity: 1, unitPrice: 18000, lineTotal: 18000, sortOrder: 0 },
          { workEntryId: we3_5.id, itemNameAr: we3_5.itemNameAr, itemNameEn: we3_5.itemNameEn, unit: we3_5.unit, approvedQuantity: 250, unitPrice: 80, lineTotal: 20000, sortOrder: 1 },
          { workEntryId: we3_6.id, itemNameAr: we3_6.itemNameAr, itemNameEn: we3_6.itemNameEn, unit: we3_6.unit, approvedQuantity: 1, unitPrice: 22000, lineTotal: 22000, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm3_1.id, referenceNo: stm3_1.referenceNo, entityName: stm3_1.title });

  const stm3_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c3.id,
      referenceNo: `STM-EMR-02-${dsSuffix}`,
      title: 'مستخلص تجهيزات العيادات الطبية - مع خصم تعاقدي 4,000 ر.س',
      issueDate: new Date('2026-02-22'),
      periodStart: new Date('2026-01-20'),
      periodEnd: new Date('2026-02-15'),
      orgSnapshot,
      subtotal: 88000,
      discountAmount: 4000,
      taxableAmount: 84000,
      vatRate: 15,
      vatAmount: 12600,
      totalAmount: 96600,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-23'),
      notes: `[TEST_DATASET:${dataset.id}] مستخلص بخصم تعاقدي متفق عليه`,
      sites: { create: [{ siteId: s3_1.id }] },
      lines: {
        create: [
          { workEntryId: we3_1.id, itemNameAr: we3_1.itemNameAr, itemNameEn: we3_1.itemNameEn, unit: we3_1.unit, approvedQuantity: 300, unitPrice: 90, lineTotal: 27000, sortOrder: 0 },
          { workEntryId: we3_2.id, itemNameAr: we3_2.itemNameAr, itemNameEn: we3_2.itemNameEn, unit: we3_2.unit, approvedQuantity: 200, unitPrice: 130, lineTotal: 26000, sortOrder: 1 },
          { workEntryId: we3_3.id, itemNameAr: we3_3.itemNameAr, itemNameEn: we3_3.itemNameEn, unit: we3_3.unit, approvedQuantity: 1, unitPrice: 35000, lineTotal: 35000, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm3_2.id, referenceNo: stm3_2.referenceNo, entityName: stm3_2.title });

  const c3Snapshot = { nameAr: c3.nameAr, nameEn: c3.nameEn, clientType: c3.clientType, vatNumber: c3.vatNumber, address: c3.address, phone: c3.phone, email: c3.email };

  // 2 Invoices for C3
  const inv3_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c3.id,
      statementId: stm3_1.id,
      referenceNo: `INV-EMR-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-20'),
      dueDate: new Date('2026-03-22'),
      supplyDate: new Date('2026-02-18'),
      orgSnapshot,
      clientSnapshot: c3Snapshot,
      subtotal: 60000,
      discountAmount: 0,
      taxableAmount: 60000,
      vatRate: 15,
      vatAmount: 9000,
      totalAmount: 69000,
      paidAmount: 40000,
      remainingAmount: 29000,
      status: 'APPROVED',
      paymentStatus: 'PARTIALLY_PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة سداد جزئي ورصيد متبقي 29,000 ر.س`,
      lines: {
        create: [
          { workEntryId: we3_4.id, itemNameAr: we3_4.itemNameAr, itemNameEn: we3_4.itemNameEn, unit: we3_4.unit, quantity: 1, unitPrice: 18000, lineSubtotal: 18000, vatRate: 15, vatAmount: 2700, lineTotal: 20700, sortOrder: 0 },
          { workEntryId: we3_5.id, itemNameAr: we3_5.itemNameAr, itemNameEn: we3_5.itemNameEn, unit: we3_5.unit, quantity: 250, unitPrice: 80, lineSubtotal: 20000, vatRate: 15, vatAmount: 3000, lineTotal: 23000, sortOrder: 1 },
          { workEntryId: we3_6.id, itemNameAr: we3_6.itemNameAr, itemNameEn: we3_6.itemNameEn, unit: we3_6.unit, quantity: 1, unitPrice: 22000, lineSubtotal: 22000, vatRate: 15, vatAmount: 3300, lineTotal: 25300, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv3_1.id, referenceNo: inv3_1.referenceNo, entityName: `فاتورة ${inv3_1.referenceNo}` });

  const inv3_2 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c3.id,
      statementId: stm3_2.id,
      referenceNo: `INV-EMR-02-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-25'),
      dueDate: new Date('2026-03-27'),
      supplyDate: new Date('2026-02-22'),
      orgSnapshot,
      clientSnapshot: c3Snapshot,
      subtotal: 88000,
      discountAmount: 4000,
      taxableAmount: 84000,
      vatRate: 15,
      vatAmount: 12600,
      totalAmount: 96600,
      paidAmount: 45000,
      remainingAmount: 51600,
      status: 'APPROVED',
      paymentStatus: 'PARTIALLY_PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة بخصم تعاقدي وسداد جزئي ورصيد متبقي 51,600 ر.س`,
      lines: {
        create: [
          { workEntryId: we3_1.id, itemNameAr: we3_1.itemNameAr, itemNameEn: we3_1.itemNameEn, unit: we3_1.unit, quantity: 300, unitPrice: 90, discountAmount: 1227.27, lineSubtotal: 25772.73, vatRate: 15, vatAmount: 3865.91, lineTotal: 29638.64, sortOrder: 0 },
          { workEntryId: we3_2.id, itemNameAr: we3_2.itemNameAr, itemNameEn: we3_2.itemNameEn, unit: we3_2.unit, quantity: 200, unitPrice: 130, discountAmount: 1181.82, lineSubtotal: 24818.18, vatRate: 15, vatAmount: 3722.73, lineTotal: 28540.91, sortOrder: 1 },
          { workEntryId: we3_3.id, itemNameAr: we3_3.itemNameAr, itemNameEn: we3_3.itemNameEn, unit: we3_3.unit, quantity: 1, unitPrice: 35000, discountAmount: 1590.91, lineSubtotal: 33409.09, vatRate: 15, vatAmount: 5011.36, lineTotal: 38420.45, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv3_2.id, referenceNo: inv3_2.referenceNo, entityName: `فاتورة ${inv3_2.referenceNo}` });

  // 2 Payments for C3
  const pay3_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c3.id,
      invoiceId: inv3_1.id,
      referenceNo: `PAY-EMR-01-${dsSuffix}`,
      paymentDate: new Date('2026-02-25'),
      amount: 40000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'بنك الرياض',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-25T11:30:00Z'),
      idempotencyKey: `idemp-c3-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] سداد جزئي للفاتورة الأولى`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay3_1.id, referenceNo: pay3_1.referenceNo || pay3_1.id, entityName: `سند قبض ${pay3_1.referenceNo}` });

  const pay3_2 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c3.id,
      invoiceId: inv3_2.id,
      referenceNo: `PAY-EMR-02-${dsSuffix}`,
      paymentDate: new Date('2026-03-01'),
      amount: 45000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'بنك الرياض',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-03-01T15:00:00Z'),
      idempotencyKey: `idemp-c3-2-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] سداد جزئي للفاتورة الثانية`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay3_2.id, referenceNo: pay3_2.referenceNo || pay3_2.id, entityName: `سند قبض ${pay3_2.referenceNo}` });

  // =========================================================================
  // CUSTOMER 4: مؤسسة الإنجاز المتقدم - TEST
  // Diverse approval statuses (APPROVED, PENDING, REJECTED, DRAFT) & eligible unbilled statement
  // =========================================================================
  const c4 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'مؤسسة الإنجاز المتقدم - TEST',
      nameEn: 'Advanced Achievement Est. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310444444400003',
      phone: '0504445566',
      email: `contracts.${dsSuffix}@enjaz-advanced-test.example.com`,
      address: 'الخبر - طريق الأمير فيصل بن فهد - حي العليا',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل لاختبار حالات الاعتماد المتعددة ومستخلص معتمد غير مفوتر`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c4.id, referenceNo: c4.id, entityName: c4.nameAr });

  // 2 Sites for C4
  const s4_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c4.id,
      nameAr: 'مشروع مركز الأعمال المتقدم - TEST',
      nameEn: 'Advanced Business Center - TEST',
      referenceNo: `SITE-ENJ-01-${dsSuffix}`,
      description: 'أعمال هيكل خرساني وتجهيز مركز أعمال إقليمي',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-10-30'),
      address: 'الخبر - الحزام الأخضر',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s4_1.id, referenceNo: s4_1.referenceNo || s4_1.id, entityName: s4_1.nameAr });

  const s4_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c4.id,
      nameAr: 'مشروع مبنى المختبرات الفنية - TEST',
      nameEn: 'Technical Laboratories Facility - TEST',
      referenceNo: `SITE-ENJ-02-${dsSuffix}`,
      description: 'إنشاء مبنى مختبرات ومعايرة لمعدات الفحص',
      status: 'ACTIVE',
      startDate: new Date('2026-01-20'),
      endDate: new Date('2026-08-30'),
      address: 'الدمام - المدينة الصناعية الأولى',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s4_2.id, referenceNo: s4_2.referenceNo || s4_2.id, entityName: s4_2.nameAr });

  // 8 Work Entries for C4 (Diverse statuses)
  const we4_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_1.id,
      referenceNo: `WRK-ENJ-01-${dsSuffix}`,
      itemNameAr: 'اختبارات فحص وتحسين التربة مع تقرير هندسي معتمد',
      itemNameEn: 'Soil testing and geotechnical soil improvement report',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 14000,
      totalAmount: 14000,
      billedQuantity: 1,
      workDate: new Date('2026-01-08'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-09'),
      notes: `[TEST_DATASET:${dataset.id}] بند معتمد داخل مستخلص معتمد`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_1.id, referenceNo: we4_1.referenceNo, entityName: we4_1.itemNameAr });

  const we4_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_1.id,
      referenceNo: `WRK-ENJ-02-${dsSuffix}`,
      itemNameAr: 'صب خرسانة مسلحة للأعمدة ورقاب الأعمدة مقاومة للأملاح',
      itemNameEn: 'Sulfate resistant reinforced concrete for columns and necks',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 90,
      unitPrice: 410,
      totalAmount: 36900,
      billedQuantity: 90,
      workDate: new Date('2026-01-14'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-15'),
      notes: `[TEST_DATASET:${dataset.id}] بند معتمد`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_2.id, referenceNo: we4_2.referenceNo, entityName: we4_2.itemNameAr });

  const we4_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_1.id,
      referenceNo: `WRK-ENJ-03-${dsSuffix}`,
      itemNameAr: 'عزل مائي وحراري للأساسات المسلحة',
      itemNameEn: 'Waterproofing and thermal barrier for substructures',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 200,
      unitPrice: 48,
      totalAmount: 9600,
      billedQuantity: 200,
      workDate: new Date('2026-01-20'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}] بند معتمد`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_3.id, referenceNo: we4_3.referenceNo, entityName: we4_3.itemNameAr });

  const we4_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_2.id,
      referenceNo: `WRK-ENJ-04-${dsSuffix}`,
      itemNameAr: 'أعمال نجارة مسلحة وحدادة لجدران خزان المياه الأرضي',
      itemNameEn: 'Formwork and rebar fixing for underground water reservoir',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 150,
      unitPrice: 80,
      totalAmount: 12000,
      billedQuantity: 0,
      workDate: new Date('2026-02-05'),
      status: 'PENDING_APPROVAL',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] قيد مراجعة المهندس المشرف`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_4.id, referenceNo: we4_4.referenceNo, entityName: we4_4.itemNameAr });

  const we4_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_2.id,
      referenceNo: `WRK-ENJ-05-${dsSuffix}`,
      itemNameAr: 'توريد حديد تسليح عالي المقاومة سابك للأرضيات',
      itemNameEn: 'High-tensile SABIC rebar supply for slabs',
      unit: 'طن',
      unitEn: 'Ton',
      quantity: 8,
      unitPrice: 3200,
      totalAmount: 25600,
      billedQuantity: 0,
      workDate: new Date('2026-02-10'),
      status: 'PENDING_APPROVAL',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] بانتظار شهادة اختبار الشد المخبري`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_5.id, referenceNo: we4_5.referenceNo, entityName: we4_5.itemNameAr });

  const we4_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_2.id,
      referenceNo: `WRK-ENJ-06-${dsSuffix}`,
      itemNameAr: 'لياسة أسمنتية للجدران الخارجية مع الشبك المعدني',
      itemNameEn: 'External cement plaster with metal lath',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 200,
      unitPrice: 35,
      totalAmount: 7000,
      billedQuantity: 0,
      workDate: new Date('2026-02-15'),
      status: 'REJECTED', // REJECTED
      rejectionReason: 'عدم مطابقة خشونة السطح وفشل اختبار الشاقول، يلزم إعادة العمل',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-16'),
      notes: `[TEST_DATASET:${dataset.id}] عمل مرفوض لعدم استيفاء المواصفات`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_6.id, referenceNo: we4_6.referenceNo, entityName: we4_6.itemNameAr });

  const we4_7 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_1.id,
      referenceNo: `WRK-ENJ-07-${dsSuffix}`,
      itemNameAr: 'أعمال التصاميم الإنشائية والمخططات التنفيذية واعتماد البلدية',
      itemNameEn: 'Structural engineering design and municipal approval drawings',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 25000,
      totalAmount: 25000,
      billedQuantity: 1,
      workDate: new Date('2026-01-05'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-06'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_7.id, referenceNo: we4_7.referenceNo, entityName: we4_7.itemNameAr });

  const we4_8 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c4.id,
      siteId: s4_2.id,
      referenceNo: `WRK-ENJ-08-${dsSuffix}`,
      itemNameAr: 'أعمال تسوية المنسوب ودك قاع الخزان بالرصاصة',
      itemNameEn: 'Subgrade soil compaction for tank bed',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 300,
      unitPrice: 15,
      totalAmount: 4500,
      billedQuantity: 0,
      workDate: new Date('2026-02-20'),
      status: 'DRAFT', // DRAFT
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] مسودة عمل`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we4_8.id, referenceNo: we4_8.referenceNo, entityName: we4_8.itemNameAr });

  // 2 Statements for C4 (STM4_1 APPROVED ready to invoice, STM4_2 DRAFT)
  const stm4_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c4.id,
      referenceNo: `STM-ENJ-01-${dsSuffix}`,
      title: 'مستخلص أعمال الأساسات والخرسانات المعتمدة - جاهز للفوترة',
      issueDate: new Date('2026-01-25'),
      periodStart: new Date('2026-01-05'),
      periodEnd: new Date('2026-01-24'),
      orgSnapshot,
      subtotal: 60500,
      discountAmount: 0,
      taxableAmount: 60500,
      vatRate: 15,
      vatAmount: 9075,
      totalAmount: 69575,
      status: 'APPROVED', // APPROVED AND ELIGIBLE TO INVOICE
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}] مستخلص معتمد مؤهل لإصدار فاتورة ضريبية رسمية`,
      sites: { create: [{ siteId: s4_1.id }] },
      lines: {
        create: [
          { workEntryId: we4_1.id, itemNameAr: we4_1.itemNameAr, itemNameEn: we4_1.itemNameEn, unit: we4_1.unit, approvedQuantity: 1, unitPrice: 14000, lineTotal: 14000, sortOrder: 0 },
          { workEntryId: we4_2.id, itemNameAr: we4_2.itemNameAr, itemNameEn: we4_2.itemNameEn, unit: we4_2.unit, approvedQuantity: 90, unitPrice: 410, lineTotal: 36900, sortOrder: 1 },
          { workEntryId: we4_3.id, itemNameAr: we4_3.itemNameAr, itemNameEn: we4_3.itemNameEn, unit: we4_3.unit, approvedQuantity: 200, unitPrice: 48, lineTotal: 9600, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm4_1.id, referenceNo: stm4_1.referenceNo, entityName: stm4_1.title });

  const stm4_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c4.id,
      referenceNo: `STM-ENJ-02-${dsSuffix}`,
      title: 'مسودة مستخلص أعمال الخزان الأرضي والمختبرات',
      issueDate: new Date('2026-02-22'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-21'),
      orgSnapshot,
      subtotal: 16500,
      discountAmount: 0,
      taxableAmount: 16500,
      vatRate: 15,
      vatAmount: 2475,
      totalAmount: 18975,
      status: 'DRAFT', // DRAFT
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] مسودة مستخلص قيد استكمال الاعتمادات الفنية`,
      sites: { create: [{ siteId: s4_2.id }] },
      lines: {
        create: [
          { workEntryId: we4_4.id, itemNameAr: we4_4.itemNameAr, itemNameEn: we4_4.itemNameEn, unit: we4_4.unit, approvedQuantity: 150, unitPrice: 80, lineTotal: 12000, sortOrder: 0 },
          { workEntryId: we4_8.id, itemNameAr: we4_8.itemNameAr, itemNameEn: we4_8.itemNameEn, unit: we4_8.unit, approvedQuantity: 300, unitPrice: 15, lineTotal: 4500, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm4_2.id, referenceNo: stm4_2.referenceNo, entityName: stm4_2.title });

  const c4Snapshot = { nameAr: c4.nameAr, nameEn: c4.nameEn, clientType: c4.clientType, vatNumber: c4.vatNumber, address: c4.address, phone: c4.phone, email: c4.email };

  // 1 Direct Invoice for C4 (Engineering designs)
  const inv4_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c4.id,
      statementId: null,
      referenceNo: `INV-ENJ-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-01-10'),
      dueDate: new Date('2026-02-10'),
      supplyDate: new Date('2026-01-05'),
      orgSnapshot,
      clientSnapshot: c4Snapshot,
      subtotal: 25000,
      discountAmount: 0,
      taxableAmount: 25000,
      vatRate: 15,
      vatAmount: 3750,
      totalAmount: 28750,
      paidAmount: 28750,
      remainingAmount: 0,
      status: 'APPROVED',
      paymentStatus: 'PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة أتعاب التصاميم الهندسية المسددة بالكامل`,
      lines: {
        create: [
          { workEntryId: we4_7.id, itemNameAr: we4_7.itemNameAr, itemNameEn: we4_7.itemNameEn, unit: we4_7.unit, quantity: 1, unitPrice: 25000, lineSubtotal: 25000, vatRate: 15, vatAmount: 3750, lineTotal: 28750, sortOrder: 0 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv4_1.id, referenceNo: inv4_1.referenceNo, entityName: `فاتورة ${inv4_1.referenceNo}` });

  // 1 Payment for C4
  const pay4_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c4.id,
      invoiceId: inv4_1.id,
      referenceNo: `PAY-ENJ-01-${dsSuffix}`,
      paymentDate: new Date('2026-01-15'),
      amount: 28750,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'مصرف الإنماء',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-15T10:00:00Z'),
      idempotencyKey: `idemp-c4-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] سداد كامل فاتورة التصاميم`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay4_1.id, referenceNo: pay4_1.referenceNo || pay4_1.id, entityName: `سند قبض ${pay4_1.referenceNo}` });

  // =========================================================================
  // CUSTOMER 5: شركة الركائز الهندسية - TEST
  // Diverse construction activities, different units (m³, m², LM, PCS, Lump Sum)
  // =========================================================================
  const c5 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'شركة الركائز الهندسية - TEST',
      nameEn: 'Engineering Pillars Co. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310555555500003',
      phone: '0505556677',
      email: `projects.${dsSuffix}@rakaez-eng-test.example.com`,
      address: 'الجبيل الصناعية - طريق 100 - منطقة المساندة',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل لاختبار تنوع وحدات القياس الهندسية والمستخلصات التخصصية`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c5.id, referenceNo: c5.id, entityName: c5.nameAr });

  // 3 Sites for C5
  const s5_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c5.id,
      nameAr: 'مشروع محطة التبريد المركزية - TEST',
      nameEn: 'Central District Cooling Plant - TEST',
      referenceNo: `SITE-RKZ-01-${dsSuffix}`,
      description: 'أعمال محطة مياه مبردة ومبنى المضخات والمحولات',
      status: 'ACTIVE',
      startDate: new Date('2026-01-05'),
      endDate: new Date('2026-11-30'),
      address: 'الجبيل - المنطقة الصناعية المساندة',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s5_1.id, referenceNo: s5_1.referenceNo || s5_1.id, entityName: s5_1.nameAr });

  const s5_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c5.id,
      nameAr: 'مشروع خطوط الأنابيب وشبكات الصرف - TEST',
      nameEn: 'Piping Networks & Drainage - TEST',
      referenceNo: `SITE-RKZ-02-${dsSuffix}`,
      description: 'تمديد واختبار خطوط أنابيب مياه التبريد وشبكات الصرف الصناعي',
      status: 'ACTIVE',
      startDate: new Date('2026-01-15'),
      endDate: new Date('2026-09-15'),
      address: 'الجبيل الصناعية - مجمع 4',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s5_2.id, referenceNo: s5_2.referenceNo || s5_2.id, entityName: s5_2.nameAr });

  const s5_3 = await tx.site.create({
    data: {
      organizationId,
      clientId: c5.id,
      nameAr: 'مشروع السياج الأمني والمبنى الإداري - TEST',
      nameEn: 'Security Fencing & Gatehouse - TEST',
      referenceNo: `SITE-RKZ-03-${dsSuffix}`,
      description: 'إنشاء سياج أمني معزز وبوابات التحكم وغرفة الأمن',
      status: 'ACTIVE',
      startDate: new Date('2026-02-01'),
      endDate: new Date('2026-07-20'),
      address: 'الجبيل - البوابة رقم 6',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s5_3.id, referenceNo: s5_3.referenceNo || s5_3.id, entityName: s5_3.nameAr });

  // 9 Work Entries for C5 (Diverse Units: m³, m², LM, PCS, Lump Sum)
  const we5_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_1.id,
      referenceNo: `WRK-RKZ-01-${dsSuffix}`,
      itemNameAr: 'صب خرسانة مقاومة للأملاح للكور والقواعد الثقيلة',
      itemNameEn: 'SRC high-strength concrete for heavy machine foundations',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 180,
      unitPrice: 380,
      totalAmount: 68400,
      billedQuantity: 180,
      workDate: new Date('2026-01-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_1.id, referenceNo: we5_1.referenceNo, entityName: we5_1.itemNameAr });

  const we5_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_1.id,
      referenceNo: `WRK-RKZ-02-${dsSuffix}`,
      itemNameAr: 'دهانات إيبوكسي عالية المقاومة للأرضيات الصناعية',
      itemNameEn: 'Heavy-duty chemical resistant epoxy floor coating',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 450,
      unitPrice: 75,
      totalAmount: 33750,
      billedQuantity: 450,
      workDate: new Date('2026-01-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_2.id, referenceNo: we5_2.referenceNo, entityName: we5_2.itemNameAr });

  const we5_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_2.id,
      referenceNo: `WRK-RKZ-03-${dsSuffix}`,
      itemNameAr: 'تمديد أنابيب كربون ستيل قطر 6 بوصة مع اللحام والتصوير',
      itemNameEn: '6-inch carbon steel chilled water piping and radiographic testing',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 220,
      unitPrice: 160,
      totalAmount: 35200,
      billedQuantity: 220,
      workDate: new Date('2026-01-25'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_3.id, referenceNo: we5_3.referenceNo, entityName: we5_3.itemNameAr });

  const we5_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_2.id,
      referenceNo: `WRK-RKZ-04-${dsSuffix}`,
      itemNameAr: 'تركيب محابس فراشة وصمامات تحكم هيدروليكية آلية',
      itemNameEn: 'Hydraulic butterfly valves and motorized control valves',
      unit: 'قطعة',
      unitEn: 'PCS',
      quantity: 12,
      unitPrice: 1250,
      totalAmount: 15000,
      billedQuantity: 12,
      workDate: new Date('2026-02-01'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-02'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_4.id, referenceNo: we5_4.referenceNo, entityName: we5_4.itemNameAr });

  const we5_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_2.id,
      referenceNo: `WRK-RKZ-05-${dsSuffix}`,
      itemNameAr: 'اختبار الضغط والتعقيم الهيدروستاتيكي لشبكة الأنابيب مع التقرير',
      itemNameEn: 'Hydrostatic pressure testing, flushing and chemical passivation',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 18000,
      totalAmount: 18000,
      billedQuantity: 1,
      workDate: new Date('2026-02-05'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-06'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_5.id, referenceNo: we5_5.referenceNo, entityName: we5_5.itemNameAr });

  const we5_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_1.id,
      referenceNo: `WRK-RKZ-06-${dsSuffix}`,
      itemNameAr: 'عزل حراري بألواح الصوف الصخري المسلح مع التغليف الألمنيوم',
      itemNameEn: 'Rockwool insulation with stucco embossed aluminum jacketing',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 300,
      unitPrice: 55,
      totalAmount: 16500,
      billedQuantity: 300,
      workDate: new Date('2026-02-08'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-09'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_6.id, referenceNo: we5_6.referenceNo, entityName: we5_6.itemNameAr });

  const we5_7 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_3.id,
      referenceNo: `WRK-RKZ-07-${dsSuffix}`,
      itemNameAr: 'تركيب كابلات جهد منخفض مسلحة 4×50 مم² نحاس مع النهايات',
      itemNameEn: 'Armored XLPE 4x50mm² copper low-voltage power cabling',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 350,
      unitPrice: 85,
      totalAmount: 29750,
      billedQuantity: 350,
      workDate: new Date('2026-02-12'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-13'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_7.id, referenceNo: we5_7.referenceNo, entityName: we5_7.itemNameAr });

  const we5_8 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_3.id,
      referenceNo: `WRK-RKZ-08-${dsSuffix}`,
      itemNameAr: 'لوحات توزيع كهربائية فرعية مانعة للغبار IP65 مع القواطع',
      itemNameEn: 'IP65 dust-proof sub-distribution panels with circuit breakers',
      unit: 'قطعة',
      unitEn: 'PCS',
      quantity: 4,
      unitPrice: 4500,
      totalAmount: 18000,
      billedQuantity: 4,
      workDate: new Date('2026-02-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_8.id, referenceNo: we5_8.referenceNo, entityName: we5_8.itemNameAr });

  const we5_9 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c5.id,
      siteId: s5_3.id,
      referenceNo: `WRK-RKZ-09-${dsSuffix}`,
      itemNameAr: 'أعمال ردم بالدفان المتدرج مع الدك الميكانيكي بنسبة 95%',
      itemNameEn: 'Graded aggregate backfilling and 95% Proctor compaction',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 600,
      unitPrice: 35,
      totalAmount: 21000,
      billedQuantity: 600,
      workDate: new Date('2026-02-18'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-19'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we5_9.id, referenceNo: we5_9.referenceNo, entityName: we5_9.itemNameAr });

  // 2 Statements for C5
  const stm5_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c5.id,
      referenceNo: `STM-RKZ-01-${dsSuffix}`,
      title: 'مستخلص شبكات الأنابيب والصمامات واختبارات الضغط',
      issueDate: new Date('2026-02-10'),
      periodStart: new Date('2026-01-20'),
      periodEnd: new Date('2026-02-08'),
      orgSnapshot,
      subtotal: 68200,
      discountAmount: 0,
      taxableAmount: 68200,
      vatRate: 15,
      vatAmount: 10230,
      totalAmount: 78430,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-11'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s5_2.id }] },
      lines: {
        create: [
          { workEntryId: we5_3.id, itemNameAr: we5_3.itemNameAr, itemNameEn: we5_3.itemNameEn, unit: we5_3.unit, approvedQuantity: 220, unitPrice: 160, lineTotal: 35200, sortOrder: 0 },
          { workEntryId: we5_4.id, itemNameAr: we5_4.itemNameAr, itemNameEn: we5_4.itemNameEn, unit: we5_4.unit, approvedQuantity: 12, unitPrice: 1250, lineTotal: 15000, sortOrder: 1 },
          { workEntryId: we5_5.id, itemNameAr: we5_5.itemNameAr, itemNameEn: we5_5.itemNameEn, unit: we5_5.unit, approvedQuantity: 1, unitPrice: 18000, lineTotal: 18000, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm5_1.id, referenceNo: stm5_1.referenceNo, entityName: stm5_1.title });

  const stm5_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c5.id,
      referenceNo: `STM-RKZ-02-${dsSuffix}`,
      title: 'مستخلص أعمال محطة التبريد والسياج الأمني والكهرباء',
      issueDate: new Date('2026-02-22'),
      periodStart: new Date('2026-01-10'),
      periodEnd: new Date('2026-02-20'),
      orgSnapshot,
      subtotal: 187400,
      discountAmount: 0,
      taxableAmount: 187400,
      vatRate: 15,
      vatAmount: 28110,
      totalAmount: 215510,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-23'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s5_1.id }, { siteId: s5_3.id }] },
      lines: {
        create: [
          { workEntryId: we5_1.id, itemNameAr: we5_1.itemNameAr, itemNameEn: we5_1.itemNameEn, unit: we5_1.unit, approvedQuantity: 180, unitPrice: 380, lineTotal: 68400, sortOrder: 0 },
          { workEntryId: we5_2.id, itemNameAr: we5_2.itemNameAr, itemNameEn: we5_2.itemNameEn, unit: we5_2.unit, approvedQuantity: 450, unitPrice: 75, lineTotal: 33750, sortOrder: 1 },
          { workEntryId: we5_6.id, itemNameAr: we5_6.itemNameAr, itemNameEn: we5_6.itemNameEn, unit: we5_6.unit, approvedQuantity: 300, unitPrice: 55, lineTotal: 16500, sortOrder: 2 },
          { workEntryId: we5_7.id, itemNameAr: we5_7.itemNameAr, itemNameEn: we5_7.itemNameEn, unit: we5_7.unit, approvedQuantity: 350, unitPrice: 85, lineTotal: 29750, sortOrder: 3 },
          { workEntryId: we5_8.id, itemNameAr: we5_8.itemNameAr, itemNameEn: we5_8.itemNameEn, unit: we5_8.unit, approvedQuantity: 4, unitPrice: 4500, lineTotal: 18000, sortOrder: 4 },
          { workEntryId: we5_9.id, itemNameAr: we5_9.itemNameAr, itemNameEn: we5_9.itemNameEn, unit: we5_9.unit, approvedQuantity: 600, unitPrice: 35, lineTotal: 21000, sortOrder: 5 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm5_2.id, referenceNo: stm5_2.referenceNo, entityName: stm5_2.title });

  const c5Snapshot = { nameAr: c5.nameAr, nameEn: c5.nameEn, clientType: c5.clientType, vatNumber: c5.vatNumber, address: c5.address, phone: c5.phone, email: c5.email };

  // 3 Invoices for C5
  const inv5_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c5.id,
      statementId: stm5_1.id,
      referenceNo: `INV-RKZ-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-12'),
      dueDate: new Date('2026-03-14'),
      supplyDate: new Date('2026-02-10'),
      orgSnapshot,
      clientSnapshot: c5Snapshot,
      subtotal: 68200,
      discountAmount: 0,
      taxableAmount: 68200,
      vatRate: 15,
      vatAmount: 10230,
      totalAmount: 78430,
      paidAmount: 78430,
      remainingAmount: 0,
      status: 'APPROVED',
      paymentStatus: 'PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسددة بالكامل بدفعتين مستقلتين`,
      lines: {
        create: [
          { workEntryId: we5_3.id, itemNameAr: we5_3.itemNameAr, itemNameEn: we5_3.itemNameEn, unit: we5_3.unit, quantity: 220, unitPrice: 160, lineSubtotal: 35200, vatRate: 15, vatAmount: 5280, lineTotal: 40480, sortOrder: 0 },
          { workEntryId: we5_4.id, itemNameAr: we5_4.itemNameAr, itemNameEn: we5_4.itemNameEn, unit: we5_4.unit, quantity: 12, unitPrice: 1250, lineSubtotal: 15000, vatRate: 15, vatAmount: 2250, lineTotal: 17250, sortOrder: 1 },
          { workEntryId: we5_5.id, itemNameAr: we5_5.itemNameAr, itemNameEn: we5_5.itemNameEn, unit: we5_5.unit, quantity: 1, unitPrice: 18000, lineSubtotal: 18000, vatRate: 15, vatAmount: 2700, lineTotal: 20700, sortOrder: 2 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv5_1.id, referenceNo: inv5_1.referenceNo, entityName: `فاتورة ${inv5_1.referenceNo}` });

  const inv5_2 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c5.id,
      statementId: stm5_2.id,
      referenceNo: `INV-RKZ-02-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-24'),
      dueDate: new Date('2026-03-26'),
      supplyDate: new Date('2026-02-22'),
      orgSnapshot,
      clientSnapshot: c5Snapshot,
      subtotal: 187400,
      discountAmount: 0,
      taxableAmount: 187400,
      vatRate: 15,
      vatAmount: 28110,
      totalAmount: 215510,
      paidAmount: 120000,
      remainingAmount: 95510,
      status: 'APPROVED',
      paymentStatus: 'PARTIALLY_PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسددة جزئياً ورصيد متبقي 95,510 ر.س`,
      lines: {
        create: [
          { workEntryId: we5_1.id, itemNameAr: we5_1.itemNameAr, itemNameEn: we5_1.itemNameEn, unit: we5_1.unit, quantity: 180, unitPrice: 380, lineSubtotal: 68400, vatRate: 15, vatAmount: 10260, lineTotal: 78660, sortOrder: 0 },
          { workEntryId: we5_2.id, itemNameAr: we5_2.itemNameAr, itemNameEn: we5_2.itemNameEn, unit: we5_2.unit, quantity: 450, unitPrice: 75, lineSubtotal: 33750, vatRate: 15, vatAmount: 5062.5, lineTotal: 38812.5, sortOrder: 1 },
          { workEntryId: we5_6.id, itemNameAr: we5_6.itemNameAr, itemNameEn: we5_6.itemNameEn, unit: we5_6.unit, quantity: 300, unitPrice: 55, lineSubtotal: 16500, vatRate: 15, vatAmount: 2475, lineTotal: 18975, sortOrder: 2 },
          { workEntryId: we5_7.id, itemNameAr: we5_7.itemNameAr, itemNameEn: we5_7.itemNameEn, unit: we5_7.unit, quantity: 350, unitPrice: 85, lineSubtotal: 29750, vatRate: 15, vatAmount: 4462.5, lineTotal: 34212.5, sortOrder: 3 },
          { workEntryId: we5_8.id, itemNameAr: we5_8.itemNameAr, itemNameEn: we5_8.itemNameEn, unit: we5_8.unit, quantity: 4, unitPrice: 4500, lineSubtotal: 18000, vatRate: 15, vatAmount: 2700, lineTotal: 20700, sortOrder: 4 },
          { workEntryId: we5_9.id, itemNameAr: we5_9.itemNameAr, itemNameEn: we5_9.itemNameEn, unit: we5_9.unit, quantity: 600, unitPrice: 35, lineSubtotal: 21000, vatRate: 15, vatAmount: 3150, lineTotal: 24150, sortOrder: 5 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv5_2.id, referenceNo: inv5_2.referenceNo, entityName: `فاتورة ${inv5_2.referenceNo}` });

  const inv5_3 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c5.id,
      statementId: null,
      referenceNo: `INV-RKZ-03-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-28'),
      dueDate: new Date('2026-03-30'),
      supplyDate: new Date('2026-02-26'),
      orgSnapshot,
      clientSnapshot: c5Snapshot,
      subtotal: 18400,
      discountAmount: 0,
      taxableAmount: 18400,
      vatRate: 15,
      vatAmount: 2760,
      totalAmount: 21160,
      paidAmount: 0,
      remainingAmount: 21160,
      status: 'APPROVED',
      paymentStatus: 'UNPAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة فحص ومعايرة طرف ثالث غير مسددة`,
      lines: {
        create: [
          { itemNameAr: 'أتعاب شهادات الفحص والمعايرة واعتماد الطرف الثالث', itemNameEn: 'Third-party testing, inspection and calibration certification', unit: 'مقطوعية', unitEn: 'Lump Sum', quantity: 1, unitPrice: 18400, lineSubtotal: 18400, vatRate: 15, vatAmount: 2760, lineTotal: 21160, sortOrder: 0 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv5_3.id, referenceNo: inv5_3.referenceNo, entityName: `فاتورة ${inv5_3.referenceNo}` });

  // 3 Payments for C5
  const pay5_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c5.id,
      invoiceId: inv5_1.id,
      referenceNo: `PAY-RKZ-01A-${dsSuffix}`,
      paymentDate: new Date('2026-02-18'),
      amount: 40000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'البنك السعودي الأول (SAB)',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-18T10:00:00Z'),
      idempotencyKey: `idemp-c5-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة أولى تحويل مصرفي`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay5_1.id, referenceNo: pay5_1.referenceNo || pay5_1.id, entityName: `سند قبض ${pay5_1.referenceNo}` });

  const pay5_2 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c5.id,
      invoiceId: inv5_1.id,
      referenceNo: `PAY-RKZ-01B-${dsSuffix}`,
      paymentDate: new Date('2026-02-22'),
      amount: 38430,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'البنك السعودي الأول (SAB)',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-22T13:00:00Z'),
      idempotencyKey: `idemp-c5-2-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة ثانية تسوية كامل الفاتورة`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay5_2.id, referenceNo: pay5_2.referenceNo || pay5_2.id, entityName: `سند قبض ${pay5_2.referenceNo}` });

  const pay5_3 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c5.id,
      invoiceId: inv5_2.id,
      referenceNo: `PAY-RKZ-02-${dsSuffix}`,
      paymentDate: new Date('2026-03-01'),
      amount: 120000,
      method: 'CHEQUE',
      chequeNumber: `CHQ-${dsSuffix}-501`,
      chequeDate: new Date('2026-03-01'),
      bankAccountId: defaultBank?.id || null,
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-03-01T11:00:00Z'),
      idempotencyKey: `idemp-c5-3-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة شيك بنكي مسحوبة على بنك ساب`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay5_3.id, referenceNo: pay5_3.referenceNo || pay5_3.id, entityName: `سند قبض ${pay5_3.referenceNo}` });

  // =========================================================================
  // CUSTOMER 6: مؤسسة التشييد المتكامل - TEST
  // Pending transactions, approved transactions, and complete account statement
  // =========================================================================
  const c6 = await tx.client.create({
    data: {
      organizationId,
      nameAr: 'مؤسسة التشييد المتكامل - TEST',
      nameEn: 'Integrated Construction Est. - TEST',
      clientType: 'COMPANY',
      vatNumber: '310666666600003',
      phone: '0506667788',
      email: `admin.${dsSuffix}@integrated-const-test.example.com`,
      address: 'المدينة المنورة - طريق الهجرة - حي الدفاع',
      status: 'ACTIVE',
      notes: `[TEST_DATASET:${dataset.id}] عميل لاختبار المعاملات المعلقة والمعتمدة ومطابقة كشف الحساب التام`,
    },
  });
  recordsToTrack.push({ entityType: 'Client', entityId: c6.id, referenceNo: c6.id, entityName: c6.nameAr });

  // 2 Sites for C6
  const s6_1 = await tx.site.create({
    data: {
      organizationId,
      clientId: c6.id,
      nameAr: 'مشروع فندق دار الضيافة - TEST',
      nameEn: 'Dar Al-Diyafa Hotel Building - TEST',
      referenceNo: `SITE-INT-01-${dsSuffix}`,
      description: 'إنشاء وتشطيب فندق 4 نجوم مكون من 10 طوابق',
      status: 'ACTIVE',
      startDate: new Date('2026-01-01'),
      endDate: new Date('2026-12-15'),
      address: 'المدينة المنورة - المنطقة المركزية',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s6_1.id, referenceNo: s6_1.referenceNo || s6_1.id, entityName: s6_1.nameAr });

  const s6_2 = await tx.site.create({
    data: {
      organizationId,
      clientId: c6.id,
      nameAr: 'مشروع مواقف السيارات متعدد الطوابق - TEST',
      nameEn: 'Multi-Story Parking Structure - TEST',
      referenceNo: `SITE-INT-02-${dsSuffix}`,
      description: 'إنشاء مواقف سيارات خرسانية مسبقة الإجهاد بسعة 600 مركبة',
      status: 'ACTIVE',
      startDate: new Date('2026-01-20'),
      endDate: new Date('2026-08-30'),
      address: 'المدينة المنورة - طريق السلام',
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'Site', entityId: s6_2.id, referenceNo: s6_2.referenceNo || s6_2.id, entityName: s6_2.nameAr });

  // 7 Work Entries for C6
  const we6_1 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_1.id,
      referenceNo: `WRK-INT-01-${dsSuffix}`,
      itemNameAr: 'واجهات زجاجية مزدوجة عازلة للصوت والحرارة للغرف الفندقية',
      itemNameEn: 'Double-glazed acoustic and thermal curtain wall facades',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 140,
      unitPrice: 350,
      totalAmount: 49000,
      billedQuantity: 140,
      workDate: new Date('2026-01-15'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-16'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_1.id, referenceNo: we6_1.referenceNo, entityName: we6_1.itemNameAr });

  const we6_2 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_1.id,
      referenceNo: `WRK-INT-02-${dsSuffix}`,
      itemNameAr: 'تركيب شبكة رشاشات إطفاء الحريق الأوتوماتيكية مع الصمامات',
      itemNameEn: 'Automatic fire sprinkler network and zone control valves',
      unit: 'قطعة',
      unitEn: 'PCS',
      quantity: 120,
      unitPrice: 150,
      totalAmount: 18000,
      billedQuantity: 120,
      workDate: new Date('2026-01-20'),
      status: 'FULLY_BILLED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-21'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_2.id, referenceNo: we6_2.referenceNo, entityName: we6_2.itemNameAr });

  const we6_3 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_2.id,
      referenceNo: `WRK-INT-03-${dsSuffix}`,
      itemNameAr: 'صب خرسانة جدران قص خرسانية مسلحة لبيت المصعد',
      itemNameEn: 'Reinforced shear walls concrete for elevator core',
      unit: 'م³',
      unitEn: 'm³',
      quantity: 60,
      unitPrice: 450,
      totalAmount: 27000,
      billedQuantity: 0,
      workDate: new Date('2026-02-01'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-02'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_3.id, referenceNo: we6_3.referenceNo, entityName: we6_3.itemNameAr });

  const we6_4 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_2.id,
      referenceNo: `WRK-INT-04-${dsSuffix}`,
      itemNameAr: 'تركيب حواجز حماية فولاذية مجلفنة لمواقف السيارات',
      itemNameEn: 'Galvanized steel crash barriers for parking decks',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 150,
      unitPrice: 90,
      totalAmount: 13500,
      billedQuantity: 0,
      workDate: new Date('2026-02-05'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-06'),
      notes: `[TEST_DATASET:${dataset.id}]`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_4.id, referenceNo: we6_4.referenceNo, entityName: we6_4.itemNameAr });

  const we6_5 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_1.id,
      referenceNo: `WRK-INT-05-${dsSuffix}`,
      itemNameAr: 'أعمال دهان ديكوري استوكو رخامي للبهو الرئيسي',
      itemNameEn: 'Decorative marbleized stucco plaster for main lobby',
      unit: 'م²',
      unitEn: 'm²',
      quantity: 200,
      unitPrice: 85,
      totalAmount: 17000,
      billedQuantity: 0,
      workDate: new Date('2026-02-15'),
      status: 'DRAFT', // DRAFT
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] مسودة عمل قيد الاعتماد المبدئي`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_5.id, referenceNo: we6_5.referenceNo, entityName: we6_5.itemNameAr });

  const we6_6 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_2.id,
      referenceNo: `WRK-INT-06-${dsSuffix}`,
      itemNameAr: 'أعمال تخطيط مواقف السيارات ودهان الإيبوكسي العاكس',
      itemNameEn: 'Reflective epoxy parking bay marking and numbering',
      unit: 'م.ط',
      unitEn: 'LM',
      quantity: 400,
      unitPrice: 25,
      totalAmount: 10000,
      billedQuantity: 0,
      workDate: new Date('2026-02-18'),
      status: 'DRAFT', // DRAFT
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] مسودة عمل`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_6.id, referenceNo: we6_6.referenceNo, entityName: we6_6.itemNameAr });

  const we6_7 = await tx.workEntry.create({
    data: {
      organizationId,
      clientId: c6.id,
      siteId: s6_1.id,
      referenceNo: `WRK-INT-07-${dsSuffix}`,
      itemNameAr: 'خدمات تشغيل مبدئي واختبار ربط شبكة إنذار الحريق بمضخات الطوارئ',
      itemNameEn: 'Fire alarm interface commissioning with emergency pump sets',
      unit: 'مقطوعية',
      unitEn: 'Lump Sum',
      quantity: 1,
      unitPrice: 20000,
      totalAmount: 20000,
      billedQuantity: 1,
      workDate: new Date('2026-02-22'),
      status: 'APPROVED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-23'),
      notes: `[TEST_DATASET:${dataset.id}] عمل معتمد لفاتورة مسودة مباشرة`,
    },
  });
  recordsToTrack.push({ entityType: 'WorkEntry', entityId: we6_7.id, referenceNo: we6_7.referenceNo, entityName: we6_7.itemNameAr });

  // 2 Statements for C6
  const stm6_1 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c6.id,
      referenceNo: `STM-INT-01-${dsSuffix}`,
      title: 'مستخلص أعمال الواجهات ومكافحة الحريق - فندق الضيافة',
      issueDate: new Date('2026-01-25'),
      periodStart: new Date('2026-01-10'),
      periodEnd: new Date('2026-01-24'),
      orgSnapshot,
      subtotal: 67000,
      discountAmount: 0,
      taxableAmount: 67000,
      vatRate: 15,
      vatAmount: 10050,
      totalAmount: 77050,
      status: 'INVOICED',
      createdById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-01-26'),
      notes: `[TEST_DATASET:${dataset.id}]`,
      sites: { create: [{ siteId: s6_1.id }] },
      lines: {
        create: [
          { workEntryId: we6_1.id, itemNameAr: we6_1.itemNameAr, itemNameEn: we6_1.itemNameEn, unit: we6_1.unit, approvedQuantity: 140, unitPrice: 350, lineTotal: 49000, sortOrder: 0 },
          { workEntryId: we6_2.id, itemNameAr: we6_2.itemNameAr, itemNameEn: we6_2.itemNameEn, unit: we6_2.unit, approvedQuantity: 120, unitPrice: 150, lineTotal: 18000, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm6_1.id, referenceNo: stm6_1.referenceNo, entityName: stm6_1.title });

  const stm6_2 = await tx.statement.create({
    data: {
      organizationId,
      clientId: c6.id,
      referenceNo: `STM-INT-02-${dsSuffix}`,
      title: 'مسودة مستخلص جدران القص والحواجز - مبنى المواقف',
      issueDate: new Date('2026-02-12'),
      periodStart: new Date('2026-02-01'),
      periodEnd: new Date('2026-02-10'),
      orgSnapshot,
      subtotal: 40500,
      discountAmount: 0,
      taxableAmount: 40500,
      vatRate: 15,
      vatAmount: 6075,
      totalAmount: 46575,
      status: 'DRAFT', // DRAFT
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] مسودة مستخلص غير معتمدة بعد`,
      sites: { create: [{ siteId: s6_2.id }] },
      lines: {
        create: [
          { workEntryId: we6_3.id, itemNameAr: we6_3.itemNameAr, itemNameEn: we6_3.itemNameEn, unit: we6_3.unit, approvedQuantity: 60, unitPrice: 450, lineTotal: 27000, sortOrder: 0 },
          { workEntryId: we6_4.id, itemNameAr: we6_4.itemNameAr, itemNameEn: we6_4.itemNameEn, unit: we6_4.unit, approvedQuantity: 150, unitPrice: 90, lineTotal: 13500, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Statement', entityId: stm6_2.id, referenceNo: stm6_2.referenceNo, entityName: stm6_2.title });

  const c6Snapshot = { nameAr: c6.nameAr, nameEn: c6.nameEn, clientType: c6.clientType, vatNumber: c6.vatNumber, address: c6.address, phone: c6.phone, email: c6.email };

  // 2 Invoices for C6 (1 APPROVED & partially paid, 1 DRAFT)
  const inv6_1 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c6.id,
      statementId: stm6_1.id,
      referenceNo: `INV-INT-01-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-01-28'),
      dueDate: new Date('2026-02-28'),
      supplyDate: new Date('2026-01-25'),
      orgSnapshot,
      clientSnapshot: c6Snapshot,
      subtotal: 67000,
      discountAmount: 0,
      taxableAmount: 67000,
      vatRate: 15,
      vatAmount: 10050,
      totalAmount: 77050,
      paidAmount: 50000,
      remainingAmount: 27050,
      status: 'APPROVED', // APPROVED - included in customer statement
      paymentStatus: 'PARTIALLY_PAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة معتمدة سداد جزئي`,
      lines: {
        create: [
          { workEntryId: we6_1.id, itemNameAr: we6_1.itemNameAr, itemNameEn: we6_1.itemNameEn, unit: we6_1.unit, quantity: 140, unitPrice: 350, lineSubtotal: 49000, vatRate: 15, vatAmount: 7350, lineTotal: 56350, sortOrder: 0 },
          { workEntryId: we6_2.id, itemNameAr: we6_2.itemNameAr, itemNameEn: we6_2.itemNameEn, unit: we6_2.unit, quantity: 120, unitPrice: 150, lineSubtotal: 18000, vatRate: 15, vatAmount: 2700, lineTotal: 20700, sortOrder: 1 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv6_1.id, referenceNo: inv6_1.referenceNo, entityName: `فاتورة ${inv6_1.referenceNo}` });

  const inv6_2 = await tx.invoice.create({
    data: {
      organizationId,
      clientId: c6.id,
      statementId: null,
      referenceNo: `INV-INT-02-${dsSuffix}`,
      invoiceType: 'TAX_INVOICE',
      issueDate: new Date('2026-02-25'),
      dueDate: new Date('2026-03-27'),
      supplyDate: new Date('2026-02-22'),
      orgSnapshot,
      clientSnapshot: c6Snapshot,
      subtotal: 20000,
      discountAmount: 0,
      taxableAmount: 20000,
      vatRate: 15,
      vatAmount: 3000,
      totalAmount: 23000,
      paidAmount: 0,
      remainingAmount: 23000,
      status: 'DRAFT', // DRAFT - intentionally NOT posted to customer statement
      paymentStatus: 'UNPAID',
      createdById: userId,
      notes: `[TEST_DATASET:${dataset.id}] فاتورة مسودة قيد التدقيق (مستثناة من كشف الحساب نظامياً)`,
      lines: {
        create: [
          { workEntryId: we6_7.id, itemNameAr: we6_7.itemNameAr, itemNameEn: we6_7.itemNameEn, unit: we6_7.unit, quantity: 1, unitPrice: 20000, lineSubtotal: 20000, vatRate: 15, vatAmount: 3000, lineTotal: 23000, sortOrder: 0 },
        ],
      },
    },
  });
  recordsToTrack.push({ entityType: 'Invoice', entityId: inv6_2.id, referenceNo: inv6_2.referenceNo, entityName: `فاتورة مسودة ${inv6_2.referenceNo}` });

  // 1 Payment for C6
  const pay6_1 = await tx.payment.create({
    data: {
      organizationId,
      clientId: c6.id,
      invoiceId: inv6_1.id,
      referenceNo: `PAY-INT-01-${dsSuffix}`,
      paymentDate: new Date('2026-02-05'),
      amount: 50000,
      method: 'BANK_TRANSFER',
      bankAccountId: defaultBank?.id || null,
      senderBankName: 'بنك الجزيرة',
      status: 'CONFIRMED',
      recordedById: userId,
      approvedById: userId,
      approvedAt: new Date('2026-02-05T14:00:00Z'),
      idempotencyKey: `idemp-c6-1-${dataset.id}`,
      notes: `[TEST_DATASET:${dataset.id}] دفعة سداد جزئي محصلة لحساب الفاتورة الأولى`,
    },
  });
  recordsToTrack.push({ entityType: 'Payment', entityId: pay6_1.id, referenceNo: pay6_1.referenceNo || pay6_1.id, entityName: `سند قبض ${pay6_1.referenceNo}` });
}
