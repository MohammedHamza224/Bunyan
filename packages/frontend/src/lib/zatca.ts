import QRCode from 'qrcode'

/**
 * Encode a single Tag-Length-Value (TLV) field according to ZATCA e-invoicing specification.
 * Tag: 1 byte
 * Length: 1 byte (length of UTF-8 value)
 * Value: UTF-8 encoded bytes
 */
function encodeTlvField(tag: number, value: string): Uint8Array {
  const encoder = new TextEncoder()
  const valueBytes = encoder.encode(value)
  const tagBytes = new Uint8Array([tag])
  const lengthBytes = new Uint8Array([valueBytes.length])
  const result = new Uint8Array(tagBytes.length + lengthBytes.length + valueBytes.length)
  result.set(tagBytes, 0)
  result.set(lengthBytes, 1)
  result.set(valueBytes, 2)
  return result
}

/**
 * Convert Uint8Array to Base64 in standard browser / isomorphic environments.
 */
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = ''
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i])
  }
  return btoa(binary)
}

/**
 * Convert Base64 string to Uint8Array.
 */
function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i)
  }
  return bytes
}

/**
 * Generate ZATCA Phase 1 TLV Base64 payload (Tags 1..5).
 * Tag 1: Seller's Name
 * Tag 2: Seller's VAT Registration Number
 * Tag 3: Time Stamp (ISO 8601 UTC)
 * Tag 4: Invoice Total (with VAT)
 * Tag 5: VAT Total
 */
export function buildZatcaPhase1TlvBase64(params: {
  sellerName: string
  vatNumber: string
  timestampIso: string
  totalWithVat: string | number
  vatTotal: string | number
}): string {
  const sellerName = (params.sellerName || '').trim()
  const vatNumber = (params.vatNumber || '').trim()
  if (!sellerName || !vatNumber) {
    throw new Error('Seller name and VAT number are required to generate ZATCA TLV')
  }

  const timestamp = params.timestampIso
  const totalStr = Number(params.totalWithVat || 0).toFixed(2)
  const vatStr = Number(params.vatTotal || 0).toFixed(2)

  const f1 = encodeTlvField(1, sellerName)
  const f2 = encodeTlvField(2, vatNumber)
  const f3 = encodeTlvField(3, timestamp)
  const f4 = encodeTlvField(4, totalStr)
  const f5 = encodeTlvField(5, vatStr)

  const totalLength = f1.length + f2.length + f3.length + f4.length + f5.length
  const combined = new Uint8Array(totalLength)
  let offset = 0
  for (const f of [f1, f2, f3, f4, f5]) {
    combined.set(f, offset)
    offset += f.length
  }

  return uint8ArrayToBase64(combined)
}

/**
 * Decode a ZATCA TLV Base64 payload into Tag -> Value mapping.
 */
export function decodeZatcaTlvBase64(base64Str: string): Record<number, string> {
  try {
    const buf = base64ToUint8Array(base64Str)
    const result: Record<number, string> = {}
    const decoder = new TextDecoder('utf-8')
    let offset = 0

    while (offset + 2 <= buf.length) {
      const tag = buf[offset]
      const length = buf[offset + 1]
      const start = offset + 2
      const end = start + length
      if (end > buf.length) break
      result[tag] = decoder.decode(buf.subarray(start, end))
      offset = end
    }

    return result
  } catch {
    return {}
  }
}

/**
 * Generate a high-contrast, scannable PNG Data URL from a ZATCA TLV Base64 payload.
 */
export async function generateZatcaQrDataUrl(tlvBase64: string, width = 220): Promise<string> {
  return QRCode.toDataURL(tlvBase64, {
    errorCorrectionLevel: 'M',
    margin: 1,
    width,
    color: {
      dark: '#000000',
      light: '#ffffff',
    },
  })
}
