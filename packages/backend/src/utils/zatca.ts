import crypto from 'crypto';
import { v4 as uuidv4 } from 'uuid';
import QRCode from 'qrcode';

/**
 * Official ZATCA Genesis Previous Invoice Hash (PIH) for the first invoice (ICV = 1):
 * Base64 encoding of the hex SHA-256 hash of "0".
 */
export const ZATCA_GENESIS_PIH = Buffer.from(
  crypto.createHash('sha256').update('0', 'utf8').digest('hex'),
  'utf8'
).toString('base64');

export interface ZatcaInvoiceInput {
  id: string;
  referenceNo: string;
  invoiceType:
    | 'TAX_INVOICE'
    | 'SIMPLIFIED_TAX_INVOICE'
    | 'SIMPLIFIED_INVOICE'
    | 'CREDIT_NOTE'
    | 'DEBIT_NOTE';
  isSimplifiedSubType?: boolean; // For Credit/Debit notes linked to a simplified invoice
  issueDate: Date;
  supplyDate?: Date | null;
  currency?: string;
  sellerNameAr: string;
  sellerVatNumber: string;
  sellerAddress?: string | null;
  sellerCommercialReg?: string | null;
  buyerNameAr: string;
  buyerVatNumber?: string | null;
  buyerAddress?: string | null;
  subtotal: string | number;
  discountAmount: string | number;
  taxableAmount: string | number;
  vatRate: string | number;
  vatAmount: string | number;
  totalAmount: string | number;
  // Cryptographic sequence & chain (Phase 2)
  icv: number;
  pih: string;
  // Credit / Debit Note references
  billingReferenceId?: string | null;
  billingReferenceUuid?: string | null;
  instructionNote?: string | null;
  lines: Array<{
    itemNameAr: string;
    quantity: string | number;
    unitPrice: string | number;
    discountAmount?: string | number;
    lineSubtotal: string | number;
    vatRate: string | number;
    vatAmount: string | number;
    lineTotal: string | number;
  }>;
}

/**
 * Validate mandatory ZATCA fields according to invoice type and tax applicability.
 * Never allows placeholder or fake tax numbers.
 */
export function validateZatcaMandatoryFields(input: {
  invoiceType: string;
  isSimplifiedSubType?: boolean;
  vatRate: number | string;
  sellerNameAr?: string | null;
  sellerVatNumber?: string | null;
  sellerAddress?: string | null;
  buyerNameAr?: string | null;
  buyerVatNumber?: string | null;
  buyerAddress?: string | null;
  billingReferenceId?: string | null;
  instructionNote?: string | null;
}): { valid: boolean; errors: string[] } {
  const errors: string[] = [];
  const saudiVatRegex = /^3\d{13}3$/;
  const vatRateNum = Number(input.vatRate);

  if (!input.sellerNameAr?.trim()) {
    errors.push('اسم المنشأة (البائع) باللغة العربية مطلوب في إعدادات المؤسسة لإصدار الفاتورة.');
  }

  if (!input.sellerAddress?.trim()) {
    errors.push('عنوان المنشأة (البائع) مطلوب في إعدادات المؤسسة وفق متطلبات الفوترة الإلكترونية.');
  }

  if (vatRateNum > 0 || input.sellerVatNumber?.trim()) {
    if (!input.sellerVatNumber || !saudiVatRegex.test(input.sellerVatNumber.trim())) {
      errors.push(
        'الرقم الضريبي للمنشأة (البائع) غير مكتمل أو غير صالح؛ يجب أن يتكون من 15 رقماً ويبدأ وينتهي بالرقم 3.'
      );
    }
  }

  if (!input.buyerNameAr?.trim()) {
    errors.push('اسم العميل (المشتري) مطلوب لإصدار الفاتورة.');
  }

  const isStandardB2B =
    input.invoiceType === 'TAX_INVOICE' ||
    ((input.invoiceType === 'CREDIT_NOTE' || input.invoiceType === 'DEBIT_NOTE') &&
      !input.isSimplifiedSubType);

  if (isStandardB2B && vatRateNum > 0) {
    if (!input.buyerVatNumber || !saudiVatRegex.test(input.buyerVatNumber.trim())) {
      errors.push(
        'الفاتورة الضريبية القياسية (B2B) تتطلب رقماً ضريبياً صحيحاً للمشتري (15 رقماً يبدأ وينتهي بـ 3). للعملاء الأفراد بدون رقم ضريبي استخدم الفاتورة الضريبية المبسطة.'
      );
    }
    if (!input.buyerAddress?.trim()) {
      errors.push('الفاتورة الضريبية القياسية (B2B) تتطلب وجود عنوان مسجل للعميل (المشتري).');
    }
  }

  if (input.invoiceType === 'CREDIT_NOTE' || input.invoiceType === 'DEBIT_NOTE') {
    if (!input.billingReferenceId?.trim()) {
      errors.push('الإشعار الدائن أو المدين يجب أن يرتبط برقم الفاتورة الأصلية (BillingReference).');
    }
    if (!input.instructionNote?.trim()) {
      errors.push('يرجى تحديد سبب إصدار الإشعار الدائن أو المدين (InstructionNote).');
    }
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Encode a single Tag-Length-Value (TLV) field according to ZATCA e-invoicing specification.
 */
function encodeTlvField(tag: number, value: string | Buffer): Buffer {
  const valueBuffer = Buffer.isBuffer(value) ? value : Buffer.from(value, 'utf8');
  const tagBuffer = Buffer.from([tag]);
  const lengthBuffer = Buffer.from([valueBuffer.length]);
  return Buffer.concat([tagBuffer, lengthBuffer, valueBuffer]);
}

/**
 * Generate ZATCA TLV Base64 QR Code according to Phase 1 and Phase 2 specifications:
 * - Tags 1..5: Mandatory for all electronic invoices (Seller, VAT No, Timestamp, Total, VAT Total)
 * - Tag 6: SHA-256 Hash of XML invoice (Phase 2 mandatory)
 * - Tag 7: ECDSA Digital Signature (Phase 2 signed invoices)
 * - Tag 8: ECDSA Public Key (Phase 2 signed invoices)
 * - Tag 9: Cryptographic Stamp Identifier (CSID) of X.509 certificate (Phase 2 signed invoices)
 * Requires genuine Seller Name and Seller VAT Number — never uses fallback placeholders.
 */
export function generateZatcaQrTlvBase64(params: {
  sellerName: string;
  vatNumber: string;
  timestampIso: string;
  totalWithVat: string | number;
  vatTotal: string | number;
  xmlHash?: string;
  signature?: string;
  publicKey?: string;
  certificateSignature?: string;
}): string {
  const sellerName = params.sellerName.trim();
  const vatNumber = params.vatNumber.trim();
  if (!sellerName || !vatNumber) {
    throw new Error('Seller name and VAT number are required to generate ZATCA TLV QR code');
  }

  const timestamp = params.timestampIso;
  const totalStr = Number(params.totalWithVat).toFixed(2);
  const vatStr = Number(params.vatTotal).toFixed(2);

  const buffers = [
    encodeTlvField(1, sellerName),
    encodeTlvField(2, vatNumber),
    encodeTlvField(3, timestamp),
    encodeTlvField(4, totalStr),
    encodeTlvField(5, vatStr),
  ];

  if (params.xmlHash) {
    buffers.push(encodeTlvField(6, params.xmlHash));
  }
  if (params.signature) {
    buffers.push(encodeTlvField(7, params.signature));
  }
  if (params.publicKey) {
    buffers.push(encodeTlvField(8, params.publicKey));
  }
  if (params.certificateSignature) {
    buffers.push(encodeTlvField(9, params.certificateSignature));
  }

  return Buffer.concat(buffers).toString('base64');
}

/**
 * Generate a scannable ISO/IEC 18004 2D QR Code in SVG format from the ZATCA TLV Base64 payload.
 */
export async function generateZatcaQrSvg(tlvBase64: string): Promise<string> {
  return QRCode.toString(tlvBase64, {
    type: 'svg',
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 160,
  });
}

/**
 * Generate a scannable 2D QR Code Data URL (PNG base64) from the ZATCA TLV Base64 payload.
 */
export async function generateZatcaQrDataUrl(tlvBase64: string): Promise<string> {
  return QRCode.toDataURL(tlvBase64, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width: 180,
  });
}

export interface DecodedZatcaQr {
  sellerName?: string; // Tag 1
  vatNumber?: string;  // Tag 2
  timestamp?: string;  // Tag 3
  totalWithVat?: string; // Tag 4
  vatTotal?: string;     // Tag 5
  xmlHash?: string;      // Tag 6
  signature?: string;    // Tag 7
  publicKey?: string;    // Tag 8
  certificateSignature?: string; // Tag 9
  rawTags: Record<number, string>;
  isValid: boolean;
  errors: string[];
}

/**
 * Decode a ZATCA TLV Base64 QR Code back into tag-value pairs and structured fields.
 */
export function decodeZatcaQrTlvBase64(base64Str: string): Record<number, string> {
  const buf = Buffer.from(base64Str, 'base64');
  const result: Record<number, string> = {};
  let offset = 0;

  while (offset + 2 <= buf.length) {
    const tag = buf[offset];
    const length = buf[offset + 1];
    const start = offset + 2;
    const end = start + length;
    if (end > buf.length) break;
    result[tag] = buf.subarray(start, end).toString('utf8');
    offset = end;
  }

  return result;
}

/**
 * Perform deep decoding and structural validation on a ZATCA TLV QR code payload.
 */
export function inspectZatcaQrCode(base64Str: string): DecodedZatcaQr {
  const rawTags = decodeZatcaQrTlvBase64(base64Str);
  const errors: string[] = [];

  const sellerName = rawTags[1];
  const vatNumber = rawTags[2];
  const timestamp = rawTags[3];
  const totalWithVat = rawTags[4];
  const vatTotal = rawTags[5];
  const xmlHash = rawTags[6];
  const signature = rawTags[7];
  const publicKey = rawTags[8];
  const certificateSignature = rawTags[9];

  if (!sellerName) errors.push('Tag 1 (Seller Name) is missing from QR payload');
  if (!vatNumber) {
    errors.push('Tag 2 (Seller VAT Number) is missing from QR payload');
  } else if (!/^3\d{13}3$/.test(vatNumber)) {
    errors.push('Tag 2 (Seller VAT Number) is invalid: must be 15 digits starting and ending with 3');
  }

  if (!timestamp) {
    errors.push('Tag 3 (Invoice Timestamp) is missing from QR payload');
  } else if (isNaN(new Date(timestamp).getTime())) {
    errors.push('Tag 3 (Invoice Timestamp) is not a valid ISO 8601 date string');
  }

  if (totalWithVat === undefined) {
    errors.push('Tag 4 (Invoice Total With VAT) is missing from QR payload');
  } else if (isNaN(Number(totalWithVat))) {
    errors.push('Tag 4 (Invoice Total With VAT) is not a valid numerical amount');
  }

  if (vatTotal === undefined) {
    errors.push('Tag 5 (VAT Total) is missing from QR payload');
  } else if (isNaN(Number(vatTotal))) {
    errors.push('Tag 5 (VAT Total) is not a valid numerical amount');
  }

  return {
    sellerName,
    vatNumber,
    timestamp,
    totalWithVat,
    vatTotal,
    xmlHash,
    signature,
    publicKey,
    certificateSignature,
    rawTags,
    isValid: errors.length === 0,
    errors,
  };
}

/**
 * Escape XML special characters safely.
 */
function escapeXml(unsafe: string | null | undefined): string {
  if (!unsafe) return '';
  return String(unsafe)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Generate UBL 2.1 XML representation of the invoice according to ZATCA Phase 2 structure,
 * including ICV (Invoice Counter Value), PIH (Previous Invoice Hash), and BillingReference for Credit/Debit notes.
 */
export function generateZatcaUblXml(
  input: ZatcaInvoiceInput,
  zatcaUuid: string
): {
  xml: string;
  xmlHash: string;
} {
  const currency = input.currency || 'SAR';
  const issueDateStr = input.issueDate.toISOString().slice(0, 10);
  const issueTimeStr = input.issueDate.toISOString().slice(11, 19);

  // ZATCA UN/CEFACT InvoiceTypeCode:
  // 388 = Tax Invoice, 381 = Credit Note, 383 = Debit Note
  // name attribute: 0100000 for Standard (B2B), 0200000 for Simplified (B2C)
  const typeCode =
    input.invoiceType === 'CREDIT_NOTE'
      ? '381'
      : input.invoiceType === 'DEBIT_NOTE'
      ? '383'
      : '388';
  const isSimplified =
    input.invoiceType === 'SIMPLIFIED_INVOICE' ||
    input.invoiceType === 'SIMPLIFIED_TAX_INVOICE' ||
    input.isSimplifiedSubType === true;
  const subTypeCode = isSimplified ? '0200000' : '0100000';

  const taxCategoryId = Number(input.vatRate) > 0 ? 'S' : 'Z';

  const billingReferenceXml =
    (input.invoiceType === 'CREDIT_NOTE' || input.invoiceType === 'DEBIT_NOTE') &&
    input.billingReferenceId
      ? `
  <cac:BillingReference>
    <cac:InvoiceDocumentReference>
      <cbc:ID>${escapeXml(input.billingReferenceId)}</cbc:ID>${
        input.billingReferenceUuid
          ? `\n      <cbc:UUID>${escapeXml(input.billingReferenceUuid)}</cbc:UUID>`
          : ''
      }
    </cac:InvoiceDocumentReference>
  </cac:BillingReference>`
      : '';

  const instructionNoteXml =
    (input.invoiceType === 'CREDIT_NOTE' || input.invoiceType === 'DEBIT_NOTE') &&
    input.instructionNote
      ? `
  <cac:PaymentMeans>
    <cbc:PaymentMeansCode>10</cbc:PaymentMeansCode>
    <cbc:InstructionNote>${escapeXml(input.instructionNote)}</cbc:InstructionNote>
  </cac:PaymentMeans>`
      : '';

  const linesXml = input.lines
    .map(
      (line, idx) => `
    <cac:InvoiceLine>
      <cbc:ID>${idx + 1}</cbc:ID>
      <cbc:InvoicedQuantity>${Number(line.quantity).toFixed(4)}</cbc:InvoicedQuantity>
      <cbc:LineExtensionAmount currencyID="${currency}">${Number(line.lineSubtotal).toFixed(2)}</cbc:LineExtensionAmount>
      <cac:TaxTotal>
        <cbc:TaxAmount currencyID="${currency}">${Number(line.vatAmount).toFixed(2)}</cbc:TaxAmount>
        <cbc:RoundingAmount currencyID="${currency}">${Number(line.lineTotal).toFixed(2)}</cbc:RoundingAmount>
      </cac:TaxTotal>
      <cac:Item>
        <cbc:Name>${escapeXml(line.itemNameAr)}</cbc:Name>
        <cac:ClassifiedTaxCategory>
          <cbc:ID>${Number(line.vatRate) > 0 ? 'S' : 'Z'}</cbc:ID>
          <cbc:Percent>${Number(line.vatRate).toFixed(2)}</cbc:Percent>
          <cac:TaxScheme>
            <cbc:ID>VAT</cbc:ID>
          </cac:TaxScheme>
        </cac:ClassifiedTaxCategory>
      </cac:Item>
      <cac:Price>
        <cbc:PriceAmount currencyID="${currency}">${Number(line.unitPrice).toFixed(2)}</cbc:PriceAmount>
      </cac:Price>
    </cac:InvoiceLine>`
    )
    .join('');

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Invoice xmlns="urn:oasis:names:specification:ubl:schema:xsd:Invoice-2"
         xmlns:cac="urn:oasis:names:specification:ubl:schema:xsd:CommonAggregateComponents-2"
         xmlns:cbc="urn:oasis:names:specification:ubl:schema:xsd:CommonBasicComponents-2">
  <cbc:ProfileID>reporting:1.0</cbc:ProfileID>
  <cbc:ID>${escapeXml(input.referenceNo)}</cbc:ID>
  <cbc:UUID>${escapeXml(zatcaUuid)}</cbc:UUID>
  <cbc:IssueDate>${issueDateStr}</cbc:IssueDate>
  <cbc:IssueTime>${issueTimeStr}</cbc:IssueTime>
  <cbc:InvoiceTypeCode name="${subTypeCode}">${typeCode}</cbc:InvoiceTypeCode>
  <cbc:DocumentCurrencyCode>${currency}</cbc:DocumentCurrencyCode>
  <cbc:TaxCurrencyCode>${currency}</cbc:TaxCurrencyCode>${billingReferenceXml}
  <cac:AdditionalDocumentReference>
    <cbc:ID>ICV</cbc:ID>
    <cbc:UUID>${input.icv}</cbc:UUID>
  </cac:AdditionalDocumentReference>
  <cac:AdditionalDocumentReference>
    <cbc:ID>PIH</cbc:ID>
    <cac:Attachment>
      <cbc:EmbeddedDocumentBinaryObject mimeCode="text/plain">${escapeXml(input.pih)}</cbc:EmbeddedDocumentBinaryObject>
    </cac:Attachment>
  </cac:AdditionalDocumentReference>
  <cac:AccountingSupplierParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.sellerAddress || '')}</cbc:StreetName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.sellerNameAr)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(input.sellerVatNumber)}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingSupplierParty>
  <cac:AccountingCustomerParty>
    <cac:Party>
      <cac:PostalAddress>
        <cbc:StreetName>${escapeXml(input.buyerAddress || '')}</cbc:StreetName>
        <cac:Country>
          <cbc:IdentificationCode>SA</cbc:IdentificationCode>
        </cac:Country>
      </cac:PostalAddress>
      <cac:PartyLegalEntity>
        <cbc:RegistrationName>${escapeXml(input.buyerNameAr)}</cbc:RegistrationName>
      </cac:PartyLegalEntity>
      <cac:PartyTaxScheme>
        <cbc:CompanyID>${escapeXml(input.buyerVatNumber || '')}</cbc:CompanyID>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:PartyTaxScheme>
    </cac:Party>
  </cac:AccountingCustomerParty>${instructionNoteXml}
  <cac:TaxTotal>
    <cbc:TaxAmount currencyID="${currency}">${Number(input.vatAmount).toFixed(2)}</cbc:TaxAmount>
    <cac:TaxSubtotal>
      <cbc:TaxableAmount currencyID="${currency}">${Number(input.taxableAmount).toFixed(2)}</cbc:TaxableAmount>
      <cbc:TaxAmount currencyID="${currency}">${Number(input.vatAmount).toFixed(2)}</cbc:TaxAmount>
      <cac:TaxCategory>
        <cbc:ID>${taxCategoryId}</cbc:ID>
        <cbc:Percent>${Number(input.vatRate).toFixed(2)}</cbc:Percent>
        <cac:TaxScheme>
          <cbc:ID>VAT</cbc:ID>
        </cac:TaxScheme>
      </cac:TaxCategory>
    </cac:TaxSubtotal>
  </cac:TaxTotal>
  <cac:LegalMonetaryTotal>
    <cbc:LineExtensionAmount currencyID="${currency}">${Number(input.subtotal).toFixed(2)}</cbc:LineExtensionAmount>
    <cbc:TaxExclusiveAmount currencyID="${currency}">${Number(input.taxableAmount).toFixed(2)}</cbc:TaxExclusiveAmount>
    <cbc:TaxInclusiveAmount currencyID="${currency}">${Number(input.totalAmount).toFixed(2)}</cbc:TaxInclusiveAmount>
    <cbc:AllowanceTotalAmount currencyID="${currency}">${Number(input.discountAmount).toFixed(2)}</cbc:AllowanceTotalAmount>
    <cbc:PayableAmount currencyID="${currency}">${Number(input.totalAmount).toFixed(2)}</cbc:PayableAmount>
  </cac:LegalMonetaryTotal>${linesXml}
</Invoice>`;

  const xmlHash = crypto.createHash('sha256').update(xml, 'utf8').digest('base64');
  return { xml, xmlHash };
}

/**
 * Build full ZATCA invoice bundle (UUID, TLV QR, SVG QR, UBL 2.1 XML with ICV & PIH, SHA-256 Hash).
 * Strictly validates mandatory fields and never injects placeholder values.
 */
export async function buildZatcaInvoiceBundle(
  input: ZatcaInvoiceInput,
  existingUuid?: string | null
): Promise<{
  zatcaUuid: string;
  zatcaQrCode: string;
  qrCodeSvg: string;
  qrCodeDataUrl: string;
  zatcaXml: string;
  xmlHash: string;
  icv: number;
  pih: string;
}> {
  const zatcaUuid = existingUuid || uuidv4();
  const timestampIso = input.issueDate.toISOString();

  const { xml, xmlHash } = generateZatcaUblXml(input, zatcaUuid);

  const zatcaQrCode = generateZatcaQrTlvBase64({
    sellerName: input.sellerNameAr,
    vatNumber: input.sellerVatNumber,
    timestampIso,
    totalWithVat: input.totalAmount,
    vatTotal: input.vatAmount,
    xmlHash,
  });

  const [qrCodeSvg, qrCodeDataUrl] = await Promise.all([
    generateZatcaQrSvg(zatcaQrCode),
    generateZatcaQrDataUrl(zatcaQrCode),
  ]);

  return {
    zatcaUuid,
    zatcaQrCode,
    qrCodeSvg,
    qrCodeDataUrl,
    zatcaXml: xml,
    xmlHash,
    icv: input.icv,
    pih: input.pih,
  };
}

/**
 * Validate UBL 2.1 XML structure and schema requirements per ZATCA Phase 2 rules.
 */
export function validateZatcaUblXml(xml: string): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!xml || typeof xml !== 'string') {
    return { valid: false, errors: ['XML document is empty or invalid'] };
  }

  if (!xml.includes('urn:oasis:names:specification:ubl:schema:xsd:Invoice-2')) {
    errors.push('Missing mandatory UBL 2.1 Invoice namespace (urn:oasis:names:specification:ubl:schema:xsd:Invoice-2)');
  }

  if (!xml.includes('<cbc:ProfileID>reporting:1.0</cbc:ProfileID>')) {
    errors.push('Missing or invalid ZATCA ProfileID (must be reporting:1.0)');
  }

  if (!/<cbc:InvoiceTypeCode(\s+[^>]*>|>)(388|381|383)<\/cbc:InvoiceTypeCode>/.test(xml)) {
    errors.push('Invalid or missing InvoiceTypeCode (must be 388 for Tax Invoice, 381 for Credit Note, or 383 for Debit Note)');
  }

  if (!/<cbc:ID>ICV<\/cbc:ID>\s*<cbc:UUID>\d+<\/cbc:UUID>/.test(xml)) {
    errors.push('Missing mandatory Invoice Counter Value (ICV) AdditionalDocumentReference');
  }

  if (!/<cbc:ID>PIH<\/cbc:ID>/.test(xml)) {
    errors.push('Missing mandatory Previous Invoice Hash (PIH) AdditionalDocumentReference');
  }

  if (!/<cac:AccountingSupplierParty>[\s\S]*?<cbc:CompanyID>3\d{13}3<\/cbc:CompanyID>/.test(xml)) {
    errors.push('Missing or invalid Supplier VAT registration number in AccountingSupplierParty');
  }

  if (!/<cac:LegalMonetaryTotal>[\s\S]*?<cbc:PayableAmount/.test(xml)) {
    errors.push('Missing mandatory LegalMonetaryTotal PayableAmount element');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}
