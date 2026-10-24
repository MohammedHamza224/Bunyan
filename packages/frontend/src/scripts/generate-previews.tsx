import fs from 'fs'
import path from 'path'
import { execSync } from 'child_process'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { ProfessionalTaxInvoice } from '../components/invoices/ProfessionalTaxInvoice'
import { buildZatcaPhase1TlvBase64, generateZatcaQrDataUrl } from '../lib/zatca'
import '../i18n'

const ARTIFACTS_DIR = 'C:/Users/Lenovo/.gemini/antigravity/brain/56aec371-d4c3-4767-84a3-7d025fbd755e'

function getCompiledCss(): string {
  const assetsDir = path.resolve(__dirname, '../../dist/assets')
  const cssFiles = fs.readdirSync(assetsDir).filter((f) => f.endsWith('.css'))
  if (cssFiles.length === 0) {
    throw new Error('No CSS file found in dist/assets. Run build first.')
  }
  const cssPath = path.join(assetsDir, cssFiles[0])
  console.log('Reading compiled CSS from:', cssPath)
  return fs.readFileSync(cssPath, 'utf-8')
}

async function run() {
  const compiledCss = getCompiledCss()

  // Sample 1: INV-2026-0001 (BUNYAN Official Tax Invoice)
  const orgSnapshot = {
    businessName: 'شركة بنيان للمقاولات العامة',
    businessNameEn: 'Bunyan General Contracting Co.',
    commercialReg: '1010123456',
    vatNumber: '300000000000003',
    address: 'حي الشاطئ، طريق الملك فهد، الدمام، المملكة العربية السعودية',
    addressEn: 'Al-Shati District, King Fahd Road, Dammam, Saudi Arabia',
    phone: '+966 13 800 0000',
    email: 'info@bunyan-sa.com',
    bankName: 'مصرف الراجحي',
    bankNameEn: 'Al Rajhi Bank',
    iban: 'SA0380000000608010167519',
    accountNumber: '608010167519',
    defaultCurrency: 'SAR',
  }

  const clientSnapshot = {
    nameAr: 'شركة الرواد للاستثمار والتطوير العقاري',
    nameEn: 'Al-Rowad Real Estate Investment & Dev Co.',
    vatNumber: '310123456700003',
    commercialReg: '2050987654',
    address: 'طريق الأمير تركي، الكورنيش، الخبر، المملكة العربية السعودية',
    phone: '+966 13 899 1122',
    email: 'finance@alrowad-sa.com',
  }

  const invoice1Data = {
    id: 'cmvk8cwjl0033x4f21q2d65w6',
    referenceNo: 'INV-2026-0001',
    invoiceType: 'TAX_INVOICE',
    issueDate: '2026-10-23T09:30:00.000Z',
    supplyDate: '2026-10-22T16:00:00.000Z',
    dueDate: '2026-11-22T00:00:00.000Z',
    currency: 'SAR',
    subtotal: '245000.00',
    discountAmount: '0.00',
    taxableAmount: '245000.00',
    vatRate: '15',
    vatAmount: '36750.00',
    totalAmount: '281750.00',
    paidAmount: '281750.00',
    remainingAmount: '0.00',
    status: 'APPROVED',
    paymentStatus: 'PAID',
    zatcaStatus: 'SUBMITTED',
    zatcaUuid: '422cd1c8-95cf-488d-ba2c-3e3368ca5e33',
    zatcaIcv: 1,
    zatcaHash: 'yA98f1Jc8l2K4N5sT6vU7xY8z0A1B2C3D4E5F6G7H8I=',
    orgSnapshot,
    clientSnapshot,
    statement: {
      referenceNo: 'STM-2026-0001',
      site: {
        nameAr: 'مشروع برج الأمل السكني التجاري - المرحلة 2',
        nameEn: 'Al-Amal Residential & Commercial Tower - Phase 2',
      },
    },
    createdBy: {
      nameAr: 'م. أحمد المهندس',
      nameEn: 'Eng. Ahmed',
    },
    lines: [
      {
        id: 'l-1',
        itemNameAr: 'أعمال حفر وترحيل وتسوية تربة الأساسات',
        itemNameEn: 'Excavation, earthmoving and site grading works',
        description: 'حفر حتى منسوب التأسيس المعتمد مع ترحيل نواتج الحفر والتسوية ودك التربة وفق التقرير الجيوتقني',
        unit: 'م³',
        unitEn: 'm³',
        quantity: '1200.0000',
        unitPrice: '45.0000',
        lineSubtotal: '54000.00',
        vatRate: '15',
        vatAmount: '8100.00',
        lineTotal: '62100.00',
      },
      {
        id: 'l-2',
        itemNameAr: 'أعمال خرسانة عادية للنظافة أسفل القواعد (سمك 10 سم)',
        itemNameEn: 'Plain blinding concrete under footings (10cm thk)',
        description: 'توريد وصب خرسانة عادية مقاومة للأملاح عيار 250 كجم/م3 مع التسوية والمعالجة بالماء',
        unit: 'م²',
        unitEn: 'm²',
        quantity: '850.0000',
        unitPrice: '60.0000',
        lineSubtotal: '51000.00',
        vatRate: '15',
        vatAmount: '7650.00',
        lineTotal: '58650.00',
      },
      {
        id: 'l-3',
        itemNameAr: 'أعمال خرسانة مسلحة للقواعد المسلحة والميد',
        itemNameEn: 'Reinforced concrete for foundations and tie beams',
        description: 'خرسانة مسلحة عيار 350 كجم/م3 أسمنت مقاوم مع حديد تسليح عالي المقاومة وشدات خشبية',
        unit: 'م³',
        unitEn: 'm³',
        quantity: '280.0000',
        unitPrice: '500.0000',
        lineSubtotal: '140000.00',
        vatRate: '15',
        vatAmount: '21000.00',
        lineTotal: '161000.00',
      },
    ],
  }

  // Generate real ZATCA TLV & QR Code Data URL
  const tlvBase64 = buildZatcaPhase1TlvBase64({
    sellerName: orgSnapshot.businessName,
    vatNumber: orgSnapshot.vatNumber,
    timestampIso: invoice1Data.issueDate,
    totalWithVat: invoice1Data.totalAmount,
    vatTotal: invoice1Data.vatAmount,
  })
  const qrImageSrc = await generateZatcaQrDataUrl(tlvBase64, 180)

  const markup1 = renderToStaticMarkup(
    <ProfessionalTaxInvoice
      invoice={invoice1Data}
      qrImageSrc={qrImageSrc}
      zatcaData={{
        compliance: true,
        zatcaStatus: 'SUBMITTED',
        zatcaQrCode: tlvBase64,
        zatcaIcv: 1,
        zatcaUuid: invoice1Data.zatcaUuid,
      }}
      qrLoading={false}
    />
  )

  const wrapHtml = (title: string, bodyContent: string) => `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <title>${title}</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Sans+Arabic:wght@300;400;500;600;700&family=Inter:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&display=swap" rel="stylesheet" />
  <style>
    ${compiledCss}
    
    @page {
      size: A4 portrait;
      margin: 8mm 8mm 8mm 8mm;
    }
    
    body {
      background-color: #f1f5f9;
      margin: 0;
      padding: 20px 0;
      font-family: 'IBM Plex Sans Arabic', 'Inter', system-ui, sans-serif;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
    }

    @media print {
      body {
        background-color: #ffffff !important;
        padding: 0 !important;
        margin: 0 !important;
      }
      .a4-wrapper {
        max-width: 100% !important;
        margin: 0 !important;
        padding: 0 !important;
      }
      .a4-print-sheet {
        margin: 0 !important;
        padding: 0 !important;
        border: none !important;
        box-shadow: none !important;
        max-width: 100% !important;
        width: 100% !important;
      }
    }
  </style>
</head>
<body>
  <div class="a4-wrapper" style="max-width: 900px; margin: 0 auto;">
    ${bodyContent}
  </div>
</body>
</html>`

  const html1Path = path.join(ARTIFACTS_DIR, 'invoice-bunyan-sample.html')
  fs.writeFileSync(html1Path, wrapHtml('BUNYAN Tax Invoice INV-2026-0001', markup1), 'utf-8')
  console.log('Saved BUNYAN Sample HTML to:', html1Path)

  // Sample 2: Multi-Page Invoice (16 detailed line items)
  const multiLines = [
    { nameAr: 'أعمال حفر وترحيل نواتج الحفر بالموقع', nameEn: 'Site excavation and disposal works', unit: 'م³', unitEn: 'm³', qty: 1500, price: 40 },
    { nameAr: 'صب خرسانة نظافة عادية سماكة 10 سم', nameEn: 'Blinding concrete 100mm thickness', unit: 'م²', unitEn: 'm²', qty: 950, price: 55 },
    { nameAr: 'عزل مائي بيتوميني للأساسات طبقتين', nameEn: 'Bituminous waterproofing for footings 2 coats', unit: 'م²', unitEn: 'm²', qty: 950, price: 35 },
    { nameAr: 'خرسانة مسلحة عيار 350 للقواعد والميد', nameEn: 'Reinforced concrete C35 for footings & tie beams', unit: 'م³', unitEn: 'm³', qty: 320, price: 520 },
    { nameAr: 'خرسانة مسلحة عيار 400 للأعمدة وجدران القص', nameEn: 'RC C40 for columns and shear walls', unit: 'م³', unitEn: 'm³', qty: 180, price: 580 },
    { nameAr: 'خرسانة مسلحة عيار 350 للأسقف والكمرات', nameEn: 'RC C35 for solid slabs & beams', unit: 'م³', unitEn: 'm³', qty: 450, price: 530 },
    { nameAr: 'أعمال مباني بلوك بركاني معزول 20 سم', nameEn: 'Insulated volcanic blockwork 200mm', unit: 'م²', unitEn: 'm²', qty: 1800, price: 75 },
    { nameAr: 'أعمال لياسة داخلية للأسقف والجدران', nameEn: 'Internal plastering for walls and ceilings', unit: 'م²', unitEn: 'm²', qty: 3600, price: 32 },
    { nameAr: 'أعمال لياسة خارجية مقاومة للعوامل الجوية', nameEn: 'Weatherproof external plastering', unit: 'م²', unitEn: 'm²', qty: 1400, price: 45 },
    { nameAr: 'عزل حراري ومائي لسطح المبنى الأخير', nameEn: 'Roof thermal & combo waterproofing system', unit: 'م²', unitEn: 'm²', qty: 850, price: 110 },
    { nameAr: 'تمديدات مواسير الصرف والتغذية بالحمامات', nameEn: 'PPR water supply & PVC drainage rough-in', unit: 'نقطة', unitEn: 'point', qty: 120, price: 350 },
    { nameAr: 'تمديدات كهربائية وعلب القواطع وتأريض', nameEn: 'Electrical conduit rough-in, panels & grounding', unit: 'نقطة', unitEn: 'point', qty: 340, price: 180 },
    { nameAr: 'أعمال توريد وتركيب مجاري الهواء (دكت تكييف)', nameEn: 'HVAC sheet metal ductwork fabrication & install', unit: 'م²', unitEn: 'm²', qty: 620, price: 160 },
    { nameAr: 'أعمال تركيب أرضيات بورسلان إسباني نخب أول', nameEn: 'First-choice Spanish porcelain floor tiling', unit: 'م²', unitEn: 'm²', qty: 1100, price: 130 },
    { nameAr: 'أعمال دهانات داخلية مائية 3 أوجه جوتن', nameEn: 'Interior Jotun acrylic paint 3 coats', unit: 'م²', unitEn: 'm²', qty: 3600, price: 28 },
    { nameAr: 'أبواب خشبية مقاومة للحريق 90 دقيقة', nameEn: 'Fire-rated wooden doors 90 min with hardware', unit: 'باب', unitEn: 'door', qty: 42, price: 1850 },
  ].map((it, idx) => {
    const sub = it.qty * it.price
    const vat = sub * 0.15
    return {
      id: `multi-line-${idx + 1}`,
      itemNameAr: it.nameAr,
      itemNameEn: it.nameEn,
      description: `تنفيذ البند طبقاً لمواصفات العقد والمخططات التنفيذية المعتمدة للاستشاري المشرف (كود البند C-${100 + idx})`,
      unit: it.unit,
      unitEn: it.unitEn,
      quantity: it.qty.toFixed(2),
      unitPrice: it.price.toFixed(2),
      lineSubtotal: sub.toFixed(2),
      vatRate: '15',
      vatAmount: vat.toFixed(2),
      lineTotal: (sub + vat).toFixed(2),
    }
  })

  const multiSubtotal = multiLines.reduce((acc, l) => acc + parseFloat(l.lineSubtotal), 0)
  const multiVat = multiSubtotal * 0.15
  const multiTotal = multiSubtotal + multiVat

  const multiInvoiceData = {
    ...invoice1Data,
    id: 'inv-multipage-demo',
    referenceNo: 'INV-2026-0088',
    subtotal: multiSubtotal.toFixed(2),
    taxableAmount: multiSubtotal.toFixed(2),
    vatAmount: multiVat.toFixed(2),
    totalAmount: multiTotal.toFixed(2),
    paidAmount: '0.00',
    remainingAmount: multiTotal.toFixed(2),
    paymentStatus: 'UNPAID',
    lines: multiLines,
  }

  const multiTlv = buildZatcaPhase1TlvBase64({
    sellerName: orgSnapshot.businessName,
    vatNumber: orgSnapshot.vatNumber,
    timestampIso: multiInvoiceData.issueDate,
    totalWithVat: multiInvoiceData.totalAmount,
    vatTotal: multiInvoiceData.vatAmount,
  })
  const multiQrImage = await generateZatcaQrDataUrl(multiTlv, 180)

  const markup2 = renderToStaticMarkup(
    <ProfessionalTaxInvoice
      invoice={multiInvoiceData}
      qrImageSrc={multiQrImage}
      zatcaData={{
        compliance: true,
        zatcaStatus: 'SUBMITTED',
        zatcaQrCode: multiTlv,
        zatcaIcv: 88,
        zatcaUuid: 'f7c81d9e-1234-5678-9abc-def012345678',
      }}
      qrLoading={false}
    />
  )

  const html2Path = path.join(ARTIFACTS_DIR, 'invoice-multipage-sample.html')
  fs.writeFileSync(html2Path, wrapHtml('BUNYAN Multi-Page Tax Invoice INV-2026-0088', markup2), 'utf-8')
  console.log('Saved Multi-Page Sample HTML to:', html2Path)

  // Use Edge Headless to generate PDFs and Screenshot Previews
  const edgePath = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe'

  console.log('Generating PDF for Sample 1...')
  const pdf1Path = path.join(ARTIFACTS_DIR, 'invoice-bunyan-sample.pdf')
  execSync(`"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdf1Path}" "file:///${html1Path}"`)
  console.log('Generated PDF 1 at:', pdf1Path)

  console.log('Capturing Screenshot for Sample 1...')
  const img1Path = path.join(ARTIFACTS_DIR, 'invoice-bunyan-sample.png')
  execSync(`"${edgePath}" --headless --disable-gpu --window-size=1200,1600 --screenshot="${img1Path}" "file:///${html1Path}"`)
  console.log('Generated Screenshot 1 at:', img1Path)

  console.log('Generating PDF for Multi-Page Sample 2...')
  const pdf2Path = path.join(ARTIFACTS_DIR, 'invoice-multipage-sample.pdf')
  execSync(`"${edgePath}" --headless --disable-gpu --no-pdf-header-footer --print-to-pdf="${pdf2Path}" "file:///${html2Path}"`)
  console.log('Generated PDF 2 at:', pdf2Path)

  console.log('Capturing Screenshot for Multi-Page Sample 2...')
  const img2Path = path.join(ARTIFACTS_DIR, 'invoice-multipage-sample.png')
  execSync(`"${edgePath}" --headless --disable-gpu --window-size=1200,2400 --screenshot="${img2Path}" "file:///${html2Path}"`)
  console.log('Generated Screenshot 2 at:', img2Path)

  console.log('All PDF exports and previews successfully generated!')
}

run().catch((err) => {
  console.error('Error during generation:', err)
  process.exit(1)
})
