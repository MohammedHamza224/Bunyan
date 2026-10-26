import { prisma } from '../lib/prisma';
import { logger } from '../utils/logger';
import { generateEnterpriseSixCustomers } from './enterpriseTestDataGenerator';

export interface GenerateOptions {
  scenario?: 'standard_contracting' | 'direct_invoicing' | 'unbilled_works' | 'enterprise_six_customers';
  name?: string;
  description?: string;
}

export const testDataService = {
  /**
   * List all test datasets for an organization.
   */
  async listDatasets(organizationId: string) {
    const datasets = await prisma.testDataset.findMany({
      where: { organizationId },
      orderBy: { createdAt: 'desc' },
      include: {
        createdBy: {
          select: { id: true, nameAr: true, nameEn: true, email: true },
        },
        records: {
          select: { entityType: true, entityId: true, referenceNo: true, entityName: true },
        },
      },
    });

    return datasets.map((ds) => {
      const countsByType: Record<string, number> = {};
      for (const rec of ds.records) {
        countsByType[rec.entityType] = (countsByType[rec.entityType] || 0) + 1;
      }
      return {
        id: ds.id,
        name: ds.name,
        description: ds.description,
        scenario: ds.scenario,
        status: ds.status,
        recordCount: ds.recordCount,
        createdAt: ds.createdAt,
        updatedAt: ds.updatedAt,
        createdBy: ds.createdBy,
        summary: countsByType,
      };
    });
  },

  /**
   * Get single test dataset details with related records.
   */
  async getDatasetDetails(organizationId: string, datasetId: string) {
    const dataset = await prisma.testDataset.findFirst({
      where: { id: datasetId, organizationId },
      include: {
        createdBy: {
          select: { id: true, nameAr: true, nameEn: true, email: true },
        },
        records: true,
      },
    });

    if (!dataset) {
      throw new Error('Test dataset not found');
    }

    // Load actual entity details currently in database
    const clientIds = dataset.records.filter((r) => r.entityType === 'Client').map((r) => r.entityId);
    const siteIds = dataset.records.filter((r) => r.entityType === 'Site').map((r) => r.entityId);
    const workEntryIds = dataset.records.filter((r) => r.entityType === 'WorkEntry').map((r) => r.entityId);
    const statementIds = dataset.records.filter((r) => r.entityType === 'Statement').map((r) => r.entityId);
    const invoiceIds = dataset.records.filter((r) => r.entityType === 'Invoice').map((r) => r.entityId);
    const paymentIds = dataset.records.filter((r) => r.entityType === 'Payment').map((r) => r.entityId);

    const [clients, sites, workEntries, statements, invoices, payments] = await Promise.all([
      prisma.client.findMany({ where: { id: { in: clientIds } } }),
      prisma.site.findMany({ where: { id: { in: siteIds } } }),
      prisma.workEntry.findMany({ where: { id: { in: workEntryIds } } }),
      prisma.statement.findMany({ where: { id: { in: statementIds } } }),
      prisma.invoice.findMany({ where: { id: { in: invoiceIds } } }),
      prisma.payment.findMany({ where: { id: { in: paymentIds } } }),
    ]);

    return {
      dataset: {
        id: dataset.id,
        name: dataset.name,
        description: dataset.description,
        scenario: dataset.scenario,
        status: dataset.status,
        recordCount: dataset.recordCount,
        createdAt: dataset.createdAt,
        createdBy: dataset.createdBy,
        metadata: dataset.metadata,
      },
      entities: {
        clients,
        sites,
        workEntries,
        statements,
        invoices,
        payments,
      },
    };
  },

  /**
   * Generate a realistic, interconnected test dataset inside the real database.
   */
  async generateDataset(organizationId: string, userId: string, options: GenerateOptions = {}) {
    const scenario = options.scenario || 'standard_contracting';
    const timestamp = Date.now();
    const dateStr = new Date().toISOString().slice(0, 10);

    // Fetch org settings to get snapshots and sequences
    const org = await prisma.organization.findUnique({
      where: { id: organizationId },
      include: {
        settings: true,
        bankAccounts: { where: { isActive: true } },
      },
    });

    if (!org) {
      throw new Error('Organization not found');
    }

    const defaultBank = org.bankAccounts.find((b) => b.isDefault) || org.bankAccounts[0];
    const orgSnapshot = {
      businessName: org.settings?.businessName || 'شركة بنيان للمقاولات العامة',
      businessNameEn: org.settings?.businessNameEn || 'Bunyan General Contracting Co.',
      vatNumber: org.settings?.vatNumber || '300000000000003',
      address: org.settings?.address || 'الرياض - المملكة العربية السعودية',
      addressEn: org.settings?.addressEn || 'Riyadh, Saudi Arabia',
      phone: org.settings?.phone || '0112345678',
      email: org.settings?.email || 'info@bunyan.sa',
      website: org.settings?.website || null,
    };

    const datasetName =
      options.name?.trim() ||
      (scenario === 'enterprise_six_customers'
        ? `حزمة المنشأة المتكاملة (6 عملاء و15 مشروعاً) - ${dateStr}`
        : scenario === 'standard_contracting'
        ? `حزمة مقاولات متكاملة - ${dateStr}`
        : scenario === 'direct_invoicing'
        ? `حزمة فوترة مباشرة وسداد - ${dateStr}`
        : `حزمة أعمال منجزة غير مفوترة - ${dateStr}`);

    const datasetDescription =
      options.description?.trim() ||
      (scenario === 'enterprise_six_customers'
        ? 'بيانات تجريبية شاملة تغطي 6 عملاء مختلفين، 15 مشروعاً، 45 عملاً متنوعاً، 13 مستخلصاً، 14 فاتورة، و11 دفعة مالية مع مطابقة كشوف الحسابات.'
        : scenario === 'standard_contracting'
        ? 'بيانات تجريبية لدورة مقاولات متكاملة (عميل، مشروع، 3 أعمال منفذة، مستخلص أعمال، فاتورة ضريبية، وسند قبض جزئي).'
        : scenario === 'direct_invoicing'
        ? 'بيانات تجريبية لفوترة مباشرة وسداد كامل دون مستخلص.'
        : 'بيانات تجريبية لأعمال منجزة معتمدة ومستخلص مسودة قيد الفوترة.');

    return await prisma.$transaction(
      async (tx) => {
      // 1. Create TestDataset record
      const dataset = await tx.testDataset.create({
        data: {
          organizationId,
          createdById: userId,
          name: datasetName,
          description: datasetDescription,
          scenario,
          status: 'ACTIVE',
        },
      });

      const recordsToTrack: Array<{
        entityType: string;
        entityId: string;
        referenceNo?: string | null;
        entityName?: string | null;
      }> = [];

      if (scenario === 'standard_contracting') {
        // --- 1. Client ---
        const clientNameAr = `شركة أفق البناء للمقاولات (${dataset.id.slice(-4)})`;
        const client = await tx.client.create({
          data: {
            organizationId,
            nameAr: clientNameAr,
            nameEn: `Horizon Construction Co. (${dataset.id.slice(-4)})`,
            clientType: 'COMPANY',
            vatNumber: `3109${String(timestamp).slice(-7)}00003`,
            phone: '0501234567',
            email: `client.${dataset.id.slice(-6)}@horizon-build.example`,
            address: 'الرياض - طريق الملك فهد - مجمع الأعمال',
            status: 'ACTIVE',
            notes: `[TEST_DATASET:${dataset.id}] تم إنشاؤه عبر نظام إدارة البيانات التجريبية`,
          },
        });
        recordsToTrack.push({
          entityType: 'Client',
          entityId: client.id,
          referenceNo: client.id,
          entityName: client.nameAr,
        });

        // --- 2. Site / Project ---
        const site = await tx.site.create({
          data: {
            organizationId,
            clientId: client.id,
            nameAr: `مشروع مجمع الواحة السكني (${dataset.id.slice(-4)})`,
            nameEn: `Al-Waha Residential Complex (${dataset.id.slice(-4)})`,
            referenceNo: `SITE-TEST-${dataset.id.slice(-4)}`,
            description: 'عقد إنشاء وتشطيب مجمع سكني متكامل بقيمة 450,000 ر.س',
            status: 'ACTIVE',
            startDate: new Date('2026-02-01'),
            endDate: new Date('2026-11-30'),
            address: 'الرياض - حي النرجس',
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'Site',
          entityId: site.id,
          referenceNo: site.referenceNo || site.id,
          entityName: site.nameAr,
        });

        // --- 3. Work Entries (3 items) ---
        const items = [
          {
            itemNameAr: 'أعمال حفر وردم وتسوية الموقع العام',
            itemNameEn: 'General excavation, backfilling and site leveling',
            unit: 'م³',
            unitEn: 'm³',
            quantity: 500,
            unitPrice: 40,
            totalAmount: 20000,
            workDate: new Date('2026-02-05'),
          },
          {
            itemNameAr: 'صب خرسانة نظافة وقواعد مسلحة',
            itemNameEn: 'Plain & reinforced concrete footings and foundation',
            unit: 'م³',
            unitEn: 'm³',
            quantity: 120,
            unitPrice: 320,
            totalAmount: 38400,
            workDate: new Date('2026-02-12'),
          },
          {
            itemNameAr: 'أعمال عزل مائي وحراري للأساسات والرقاب',
            itemNameEn: 'Waterproofing & thermal insulation for foundations',
            unit: 'م²',
            unitEn: 'm²',
            quantity: 250,
            unitPrice: 48,
            totalAmount: 12000,
            workDate: new Date('2026-02-18'),
          },
        ];

        const createdWorkEntries: any[] = [];
        let seqWork = 1;
        for (const it of items) {
          const weRef = `WRK-TEST-${dataset.id.slice(-4)}-${String(seqWork++).padStart(2, '0')}`;
          const we = await tx.workEntry.create({
            data: {
              organizationId,
              clientId: client.id,
              siteId: site.id,
              referenceNo: weRef,
              itemNameAr: it.itemNameAr,
              itemNameEn: it.itemNameEn,
              unit: it.unit,
              unitEn: it.unitEn,
              quantity: it.quantity,
              unitPrice: it.unitPrice,
              totalAmount: it.totalAmount,
              billedQuantity: it.quantity, // all billed by statement
              workDate: it.workDate,
              status: 'FULLY_BILLED',
              createdById: userId,
              approvedById: userId,
              approvedAt: new Date(it.workDate.getTime() + 86400000),
              notes: `[TEST_DATASET:${dataset.id}]`,
            },
          });
          createdWorkEntries.push(we);
          recordsToTrack.push({
            entityType: 'WorkEntry',
            entityId: we.id,
            referenceNo: we.referenceNo,
            entityName: we.itemNameAr,
          });
        }

        // --- 4. Work Completion Statement ---
        const stmtSubtotal = 70400; // 20000 + 38400 + 12000
        const stmtVat = 10560; // 15%
        const stmtTotal = 80960;
        const stmtRef = `STM-TEST-${dataset.id.slice(-4)}`;

        const statement = await tx.statement.create({
          data: {
            organizationId,
            clientId: client.id,
            referenceNo: stmtRef,
            title: `مستخلص الأعمال التمهيدية والأساسات - الدفعة الأولى (${dataset.id.slice(-4)})`,
            issueDate: new Date('2026-02-22'),
            periodStart: new Date('2026-02-01'),
            periodEnd: new Date('2026-02-20'),
            orgSnapshot,
            subtotal: stmtSubtotal,
            discountAmount: 0,
            taxableAmount: stmtSubtotal,
            vatRate: 15,
            vatAmount: stmtVat,
            totalAmount: stmtTotal,
            status: 'INVOICED',
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-02-23'),
            notes: `[TEST_DATASET:${dataset.id}]`,
            sites: {
              create: [{ siteId: site.id }],
            },
            lines: {
              create: createdWorkEntries.map((we, idx) => ({
                workEntryId: we.id,
                itemNameAr: we.itemNameAr,
                itemNameEn: we.itemNameEn,
                unit: we.unit,
                unitEn: we.unitEn,
                approvedQuantity: we.quantity,
                unitPrice: we.unitPrice,
                lineTotal: we.totalAmount,
                sortOrder: idx,
              })),
            },
          },
        });
        recordsToTrack.push({
          entityType: 'Statement',
          entityId: statement.id,
          referenceNo: statement.referenceNo,
          entityName: statement.title || statement.referenceNo,
        });

        // --- 5. Tax Invoice ---
        const invRef = `INV-TEST-${dataset.id.slice(-4)}`;
        const clientSnapshot = {
          nameAr: client.nameAr,
          nameEn: client.nameEn,
          clientType: client.clientType,
          vatNumber: client.vatNumber,
          address: client.address,
          phone: client.phone,
          email: client.email,
        };

        const invoice = await tx.invoice.create({
          data: {
            organizationId,
            clientId: client.id,
            statementId: statement.id,
            referenceNo: invRef,
            invoiceType: 'TAX_INVOICE',
            issueDate: new Date('2026-02-25'),
            dueDate: new Date('2026-03-27'),
            supplyDate: new Date('2026-02-22'),
            orgSnapshot,
            clientSnapshot,
            subtotal: stmtSubtotal,
            discountAmount: 0,
            taxableAmount: stmtSubtotal,
            vatRate: 15,
            vatAmount: stmtVat,
            totalAmount: stmtTotal,
            paidAmount: 50000,
            remainingAmount: 30960, // 80960 - 50000
            status: 'APPROVED',
            paymentStatus: 'PARTIALLY_PAID',
            createdById: userId,
            notes: `[TEST_DATASET:${dataset.id}] فاتورة ضريبية من المستخلص`,
            lines: {
              create: createdWorkEntries.map((we, idx) => ({
                workEntryId: we.id,
                itemNameAr: we.itemNameAr,
                itemNameEn: we.itemNameEn,
                unit: we.unit,
                unitEn: we.unitEn,
                quantity: we.quantity,
                unitPrice: we.unitPrice,
                discountPct: 0,
                discountAmount: 0,
                lineSubtotal: we.totalAmount,
                vatRate: 15,
                vatAmount: Number(we.totalAmount) * 0.15,
                lineTotal: Number(we.totalAmount) * 1.15,
                sortOrder: idx,
              })),
            },
          },
        });
        recordsToTrack.push({
          entityType: 'Invoice',
          entityId: invoice.id,
          referenceNo: invoice.referenceNo,
          entityName: `فاتورة ${invoice.referenceNo}`,
        });

        // --- 6. Payment ---
        const payRef = `PAY-TEST-${dataset.id.slice(-4)}`;
        const payment = await tx.payment.create({
          data: {
            organizationId,
            clientId: client.id,
            invoiceId: invoice.id,
            referenceNo: payRef,
            paymentDate: new Date('2026-03-01'),
            amount: 50000,
            method: 'BANK_TRANSFER',
            bankAccountId: defaultBank ? defaultBank.id : null,
            senderBankName: 'مصرف الراجحي',
            transferDate: new Date('2026-03-01'),
            receiptNumber: `REC-${dataset.id.slice(-4)}`,
            status: 'CONFIRMED',
            recordedById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-03-01T12:00:00Z'),
            idempotencyKey: `idemp-test-${dataset.id}-${timestamp}`,
            notes: `[TEST_DATASET:${dataset.id}] دفعة بنكية محصلة`,
          },
        });
        recordsToTrack.push({
          entityType: 'Payment',
          entityId: payment.id,
          referenceNo: payment.referenceNo || payment.id,
          entityName: `سند قبض ${payment.referenceNo}`,
        });
      } else if (scenario === 'direct_invoicing') {
        // Direct Invoicing without Statement
        const client = await tx.client.create({
          data: {
            organizationId,
            nameAr: `مؤسسة الرواد للإنشاءات والتطوير (${dataset.id.slice(-4)})`,
            nameEn: `Al-Rowad Construction Est. (${dataset.id.slice(-4)})`,
            clientType: 'COMPANY',
            vatNumber: `3108${String(timestamp).slice(-7)}00003`,
            phone: '0559876543',
            email: `info.${dataset.id.slice(-6)}@alrowad.example`,
            address: 'الدمام - المدينة الصناعية الثانية',
            status: 'ACTIVE',
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'Client',
          entityId: client.id,
          referenceNo: client.id,
          entityName: client.nameAr,
        });

        const site = await tx.site.create({
          data: {
            organizationId,
            clientId: client.id,
            nameAr: `مشروع مستودعات الخرج اللوجستية (${dataset.id.slice(-4)})`,
            nameEn: `Al-Kharj Logistics Warehouses (${dataset.id.slice(-4)})`,
            referenceNo: `SITE-TEST-DIR-${dataset.id.slice(-4)}`,
            description: 'عقد إنشاء مستودعات لوجستية بقيمة 180,000 ر.س',
            status: 'ACTIVE',
            startDate: new Date('2026-02-15'),
            endDate: new Date('2026-08-30'),
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'Site',
          entityId: site.id,
          referenceNo: site.referenceNo || site.id,
          entityName: site.nameAr,
        });

        const we = await tx.workEntry.create({
          data: {
            organizationId,
            clientId: client.id,
            siteId: site.id,
            referenceNo: `WRK-TEST-DIR-${dataset.id.slice(-4)}`,
            itemNameAr: 'توريد وتركيب هياكل حديدية مسبقة الصنع',
            itemNameEn: 'Supply and installation of pre-engineered steel structures',
            unit: 'م²',
            unitEn: 'm²',
            quantity: 400,
            unitPrice: 150,
            totalAmount: 60000,
            billedQuantity: 400,
            workDate: new Date('2026-02-20'),
            status: 'FULLY_BILLED',
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-02-21'),
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'WorkEntry',
          entityId: we.id,
          referenceNo: we.referenceNo,
          entityName: we.itemNameAr,
        });

        const subtotal = 60000;
        const vat = 9000;
        const total = 69000;
        const invRef = `INV-TEST-DIR-${dataset.id.slice(-4)}`;

        const invoice = await tx.invoice.create({
          data: {
            organizationId,
            clientId: client.id,
            statementId: null, // Direct invoice
            referenceNo: invRef,
            invoiceType: 'TAX_INVOICE',
            issueDate: new Date('2026-02-24'),
            dueDate: new Date('2026-03-25'),
            supplyDate: new Date('2026-02-20'),
            orgSnapshot,
            clientSnapshot: {
              nameAr: client.nameAr,
              nameEn: client.nameEn,
              clientType: client.clientType,
              vatNumber: client.vatNumber,
              address: client.address,
              phone: client.phone,
              email: client.email,
            },
            subtotal,
            discountAmount: 0,
            taxableAmount: subtotal,
            vatRate: 15,
            vatAmount: vat,
            totalAmount: total,
            paidAmount: total, // Fully paid
            remainingAmount: 0,
            status: 'APPROVED',
            paymentStatus: 'PAID',
            createdById: userId,
            notes: `[TEST_DATASET:${dataset.id}] فاتورة مباشرة معتمدة ومسددة`,
            lines: {
              create: [
                {
                  workEntryId: we.id,
                  itemNameAr: we.itemNameAr,
                  itemNameEn: we.itemNameEn,
                  unit: we.unit,
                  unitEn: we.unitEn,
                  quantity: we.quantity,
                  unitPrice: we.unitPrice,
                  discountPct: 0,
                  discountAmount: 0,
                  lineSubtotal: we.totalAmount,
                  vatRate: 15,
                  vatAmount: 9000,
                  lineTotal: 69000,
                  sortOrder: 0,
                },
              ],
            },
          },
        });
        recordsToTrack.push({
          entityType: 'Invoice',
          entityId: invoice.id,
          referenceNo: invoice.referenceNo,
          entityName: `فاتورة ${invoice.referenceNo}`,
        });

        const payRef = `PAY-TEST-DIR-${dataset.id.slice(-4)}`;
        const payment = await tx.payment.create({
          data: {
            organizationId,
            clientId: client.id,
            invoiceId: invoice.id,
            referenceNo: payRef,
            paymentDate: new Date('2026-02-26'),
            amount: total,
            method: 'BANK_TRANSFER',
            bankAccountId: defaultBank ? defaultBank.id : null,
            senderBankName: 'البنك السعودي الفرنسي',
            status: 'CONFIRMED',
            recordedById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-02-26T10:00:00Z'),
            idempotencyKey: `idemp-dir-${dataset.id}-${timestamp}`,
            notes: `[TEST_DATASET:${dataset.id}] سداد كامل الفاتورة`,
          },
        });
        recordsToTrack.push({
          entityType: 'Payment',
          entityId: payment.id,
          referenceNo: payment.referenceNo || payment.id,
          entityName: `سند قبض ${payment.referenceNo}`,
        });
      } else if (scenario === 'enterprise_six_customers') {
        await generateEnterpriseSixCustomers(
          tx,
          organizationId,
          userId,
          dataset,
          defaultBank,
          orgSnapshot,
          recordsToTrack
        );
      } else {
        // unbilled_works: Client, Site, 2 Approved entries, 1 Draft statement
        const client = await tx.client.create({
          data: {
            organizationId,
            nameAr: `شركة الصرح للمقاولات المعمارية (${dataset.id.slice(-4)})`,
            nameEn: `Al-Sarh Architectural Co. (${dataset.id.slice(-4)})`,
            clientType: 'COMPANY',
            vatNumber: `3107${String(timestamp).slice(-7)}00003`,
            phone: '0567788990',
            email: `contact.${dataset.id.slice(-6)}@alsarh.example`,
            address: 'جدة - حي الأندلس',
            status: 'ACTIVE',
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'Client',
          entityId: client.id,
          referenceNo: client.id,
          entityName: client.nameAr,
        });

        const site = await tx.site.create({
          data: {
            organizationId,
            clientId: client.id,
            nameAr: `مشروع برج المرقب التجاري (${dataset.id.slice(-4)})`,
            nameEn: `Al-Murqab Commercial Tower (${dataset.id.slice(-4)})`,
            referenceNo: `SITE-TEST-UNB-${dataset.id.slice(-4)}`,
            description: 'عقد تنفيذ أعمال كهروميكانيكية لبرج تجاري بقيمة 320,000 ر.س',
            status: 'ACTIVE',
            startDate: new Date('2026-03-01'),
            endDate: new Date('2026-12-31'),
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'Site',
          entityId: site.id,
          referenceNo: site.referenceNo || site.id,
          entityName: site.nameAr,
        });

        const we1 = await tx.workEntry.create({
          data: {
            organizationId,
            clientId: client.id,
            siteId: site.id,
            referenceNo: `WRK-TEST-UNB-${dataset.id.slice(-4)}-01`,
            itemNameAr: 'أعمال تمديد شبكات السباكة والتغذية الرئيسية',
            itemNameEn: 'Plumbing supply pipe network installation',
            unit: 'م ط',
            unitEn: 'lm',
            quantity: 350,
            unitPrice: 65,
            totalAmount: 22750,
            billedQuantity: 0,
            workDate: new Date('2026-03-05'),
            status: 'APPROVED',
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-03-06'),
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'WorkEntry',
          entityId: we1.id,
          referenceNo: we1.referenceNo,
          entityName: we1.itemNameAr,
        });

        const we2 = await tx.workEntry.create({
          data: {
            organizationId,
            clientId: client.id,
            siteId: site.id,
            referenceNo: `WRK-TEST-UNB-${dataset.id.slice(-4)}-02`,
            itemNameAr: 'تمديد كابلات وقنوات التغذية الكهربائية',
            itemNameEn: 'Electrical power conduit and cable installation',
            unit: 'م ط',
            unitEn: 'lm',
            quantity: 420,
            unitPrice: 55,
            totalAmount: 23100,
            billedQuantity: 0,
            workDate: new Date('2026-03-10'),
            status: 'APPROVED',
            createdById: userId,
            approvedById: userId,
            approvedAt: new Date('2026-03-11'),
            notes: `[TEST_DATASET:${dataset.id}]`,
          },
        });
        recordsToTrack.push({
          entityType: 'WorkEntry',
          entityId: we2.id,
          referenceNo: we2.referenceNo,
          entityName: we2.itemNameAr,
        });

        const stmtSubtotal = 45850; // 22750 + 23100
        const stmtVat = 6877.5;
        const stmtTotal = 52727.5;

        const statement = await tx.statement.create({
          data: {
            organizationId,
            clientId: client.id,
            referenceNo: `STM-TEST-UNB-${dataset.id.slice(-4)}`,
            title: `مسودة مستخلص الأعمال الكهروميكانيكية (${dataset.id.slice(-4)})`,
            issueDate: new Date('2026-03-15'),
            periodStart: new Date('2026-03-01'),
            periodEnd: new Date('2026-03-14'),
            orgSnapshot,
            subtotal: stmtSubtotal,
            discountAmount: 0,
            taxableAmount: stmtSubtotal,
            vatRate: 15,
            vatAmount: stmtVat,
            totalAmount: stmtTotal,
            status: 'DRAFT', // Ready for testing approval workflow
            createdById: userId,
            notes: `[TEST_DATASET:${dataset.id}] مستخلص مسودة قيد المراجعة والاعتماد`,
            sites: {
              create: [{ siteId: site.id }],
            },
            lines: {
              create: [
                {
                  workEntryId: we1.id,
                  itemNameAr: we1.itemNameAr,
                  itemNameEn: we1.itemNameEn,
                  unit: we1.unit,
                  unitEn: we1.unitEn,
                  approvedQuantity: we1.quantity,
                  unitPrice: we1.unitPrice,
                  lineTotal: we1.totalAmount,
                  sortOrder: 0,
                },
                {
                  workEntryId: we2.id,
                  itemNameAr: we2.itemNameAr,
                  itemNameEn: we2.itemNameEn,
                  unit: we2.unit,
                  unitEn: we2.unitEn,
                  approvedQuantity: we2.quantity,
                  unitPrice: we2.unitPrice,
                  lineTotal: we2.totalAmount,
                  sortOrder: 1,
                },
              ],
            },
          },
        });
        recordsToTrack.push({
          entityType: 'Statement',
          entityId: statement.id,
          referenceNo: statement.referenceNo,
          entityName: statement.title || statement.referenceNo,
        });
      }

      // 4. Batch create TestDatasetRecord rows
      for (const rec of recordsToTrack) {
        await tx.testDatasetRecord.create({
          data: {
            datasetId: dataset.id,
            entityType: rec.entityType,
            entityId: rec.entityId,
            referenceNo: rec.referenceNo,
            entityName: rec.entityName,
          },
        });
      }

      // 5. Update recordCount on TestDataset
      await tx.testDataset.update({
        where: { id: dataset.id },
        data: {
          recordCount: recordsToTrack.length,
          metadata: {
            createdSummary: recordsToTrack.reduce((acc: any, r) => {
              acc[r.entityType] = (acc[r.entityType] || 0) + 1;
              return acc;
            }, {}),
          },
        },
      });

      // 6. Record audit log
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'CREATE',
          entityType: 'TestDataset',
          entityId: dataset.id,
          description: `إنشاء حزمة بيانات تجريبية: "${datasetName}" (${recordsToTrack.length} سجلات)`,
          metadata: {
            datasetId: dataset.id,
            scenario,
            recordCount: recordsToTrack.length,
          },
        },
      });

      return {
        datasetId: dataset.id,
        name: dataset.name,
        scenario: dataset.scenario,
        recordCount: recordsToTrack.length,
        records: recordsToTrack,
      };
    }, { maxWait: 20000, timeout: 90000 });
  },

  /**
   * Safely purge a test dataset, verifying dependencies and removing ONLY its records.
   */
  async purgeDataset(organizationId: string, datasetId: string, userId: string) {
    const dataset = await prisma.testDataset.findFirst({
      where: { id: datasetId, organizationId },
      include: {
        records: true,
      },
    });

    if (!dataset) {
      throw new Error('Test dataset not found');
    }

    if (dataset.status === 'PURGED') {
      return {
        success: true,
        message: 'Dataset has already been purged',
        deletedCount: 0,
      };
    }

    // Collect IDs strictly belonging to this dataset
    const paymentIds = dataset.records.filter((r) => r.entityType === 'Payment').map((r) => r.entityId);
    const invoiceIds = dataset.records.filter((r) => r.entityType === 'Invoice').map((r) => r.entityId);
    const statementIds = dataset.records.filter((r) => r.entityType === 'Statement').map((r) => r.entityId);
    const workEntryIds = dataset.records.filter((r) => r.entityType === 'WorkEntry').map((r) => r.entityId);
    const siteIds = dataset.records.filter((r) => r.entityType === 'Site').map((r) => r.entityId);
    const clientIds = dataset.records.filter((r) => r.entityType === 'Client').map((r) => r.entityId);

    // Safety checks: verify no external non-test payments reference these invoices
    if (invoiceIds.length > 0) {
      const externalPayments = await prisma.payment.findMany({
        where: {
          invoiceId: { in: invoiceIds },
          id: { notIn: paymentIds },
        },
      });
      if (externalPayments.length > 0) {
        throw new Error(
          `Cannot delete test dataset: ${externalPayments.length} external payment(s) were recorded against its invoices.`
        );
      }
    }

    // Perform dependency-safe deletion in transaction
    const result = await prisma.$transaction(async (tx) => {
      let deletedCount = 0;

      // 1. Delete Payments
      if (paymentIds.length > 0) {
        const delPayments = await tx.payment.deleteMany({
          where: { id: { in: paymentIds }, organizationId },
        });
        deletedCount += delPayments.count;
      }

      // 2. Delete Invoices & Lines
      if (invoiceIds.length > 0) {
        await tx.invoiceLine.deleteMany({
          where: { invoiceId: { in: invoiceIds } },
        });
        const delInvoices = await tx.invoice.deleteMany({
          where: { id: { in: invoiceIds }, organizationId },
        });
        deletedCount += delInvoices.count;
      }

      // 3. Delete Statements & Lines
      if (statementIds.length > 0) {
        await tx.statementLine.deleteMany({
          where: { statementId: { in: statementIds } },
        });
        await tx.statementSite.deleteMany({
          where: { statementId: { in: statementIds } },
        });
        const delStatements = await tx.statement.deleteMany({
          where: { id: { in: statementIds }, organizationId },
        });
        deletedCount += delStatements.count;
      }

      // 4. Delete Work Entries
      if (workEntryIds.length > 0) {
        const delWorkEntries = await tx.workEntry.deleteMany({
          where: { id: { in: workEntryIds }, organizationId },
        });
        deletedCount += delWorkEntries.count;
      }

      // 5. Delete Sites
      if (siteIds.length > 0) {
        const delSites = await tx.site.deleteMany({
          where: { id: { in: siteIds }, organizationId },
        });
        deletedCount += delSites.count;
      }

      // 6. Delete Clients
      if (clientIds.length > 0) {
        const delClients = await tx.client.deleteMany({
          where: { id: { in: clientIds }, organizationId },
        });
        deletedCount += delClients.count;
      }

      // 7. Delete TestDatasetRecords and mark dataset PURGED (or delete dataset)
      await tx.testDatasetRecord.deleteMany({
        where: { datasetId },
      });

      await tx.testDataset.update({
        where: { id: datasetId },
        data: {
          status: 'PURGED',
          recordCount: 0,
        },
      });

      // 8. Audit log entry
      await tx.auditLog.create({
        data: {
          organizationId,
          userId,
          action: 'DELETE',
          entityType: 'TestDataset',
          entityId: datasetId,
          description: `حذف آمن لحزمة البيانات التجريبية: "${dataset.name}" (تم حذف ${deletedCount} سجل)`,
          metadata: {
            datasetId,
            deletedCount,
            purgedTypes: {
              payments: paymentIds.length,
              invoices: invoiceIds.length,
              statements: statementIds.length,
              workEntries: workEntryIds.length,
              sites: siteIds.length,
              clients: clientIds.length,
            },
          },
        },
      });

      return {
        success: true,
        deletedCount,
        details: {
          payments: paymentIds.length,
          invoices: invoiceIds.length,
          statements: statementIds.length,
          workEntries: workEntryIds.length,
          sites: siteIds.length,
          clients: clientIds.length,
        },
      };
    });

    return result;
  },
};
