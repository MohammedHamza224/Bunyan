const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

const STANDARD_UNITS = [
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

async function seedUnits() {
  const orgs = await prisma.organization.findMany();
  console.log(`Found ${orgs.length} organization(s) to seed units.`);

  for (const org of orgs) {
    console.log(`Seeding units for organization ${org.id}...`);
    for (const unit of STANDARD_UNITS) {
      await prisma.unitOfMeasure.upsert({
        where: {
          organizationId_code: {
            organizationId: org.id,
            code: unit.code,
          },
        },
        update: {
          nameAr: unit.nameAr,
          nameEn: unit.nameEn,
          symbolAr: unit.symbolAr,
          symbolEn: unit.symbolEn,
          category: unit.category,
          sortOrder: unit.sortOrder,
        },
        create: {
          organizationId: org.id,
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

    // Now link existing WorkItemTemplates to matching units by symbol/name
    const templates = await prisma.workItemTemplate.findMany({
      where: { organizationId: org.id },
    });
    for (const tmpl of templates) {
      const match = await prisma.unitOfMeasure.findFirst({
        where: {
          organizationId: org.id,
          OR: [
            { symbolAr: tmpl.unit },
            { nameAr: tmpl.unit },
            { code: tmpl.unit },
          ],
        },
      });
      if (match) {
        await prisma.workItemTemplate.update({
          where: { id: tmpl.id },
          data: {
            unitOfMeasureId: match.id,
            unit: match.symbolAr,
            unitEn: match.symbolEn,
          },
        });
      }
    }
  }

  console.log('Seeding standard construction units completed successfully!');
  await prisma.$disconnect();
}

seedUnits().catch((err) => {
  console.error('Seeding error:', err);
  process.exit(1);
});
