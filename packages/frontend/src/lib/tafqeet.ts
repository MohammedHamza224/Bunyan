/**
 * Professional Bilingual Number-to-Words / Tafqeet Utility
 * Supports Arabic (Tafqeet) and English financial words for invoices.
 */

const onesAr = [
  '',
  'واحد',
  'اثنان',
  'ثلاثة',
  'أربعة',
  'خمسة',
  'ستة',
  'سبعة',
  'ثمانية',
  'تسعة',
  'عشرة',
  'أحد عشر',
  'اثنا عشر',
  'ثلاثة عشر',
  'أربعة عشر',
  'خمسة عشر',
  'ستة عشر',
  'سبعة عشر',
  'ثمانية عشر',
  'تسعة عشر',
]

const tensAr = [
  '',
  '',
  'عشرون',
  'ثلاثون',
  'أربعون',
  'خمسون',
  'ستون',
  'سبعون',
  'ثمانون',
  'تسعون',
]

const hundredsAr = [
  '',
  'مائة',
  'مائتان',
  'ثلاثمائة',
  'أربعمائة',
  'خمسمائة',
  'ستمائة',
  'سبعمائة',
  'ثمانمائة',
  'تسعمائة',
]

function convertUnderThousandAr(n: number): string {
  if (n === 0) return ''
  let str = ''
  const h = Math.floor(n / 100)
  const rem = n % 100
  if (h > 0) {
    str += hundredsAr[h]
  }
  if (rem > 0) {
    if (str) str += ' و'
    if (rem < 20) {
      str += onesAr[rem]
    } else {
      const o = rem % 10
      const t = Math.floor(rem / 10)
      if (o > 0) str += onesAr[o] + ' و'
      str += tensAr[t]
    }
  }
  return str
}

export function tafqeetArabic(
  amount: number,
  currency = 'ريال سعودي',
  fractionCurrency = 'هللة'
): string {
  if (isNaN(amount) || amount === 0) return 'صفر ' + currency
  const num = Math.abs(amount)
  const integerPart = Math.floor(num)
  const fractionPart = Math.round((num - integerPart) * 100)

  const parts: string[] = []
  const millions = Math.floor(integerPart / 1000000)
  const thousands = Math.floor((integerPart % 1000000) / 1000)
  const remainder = integerPart % 1000

  if (millions > 0) {
    if (millions === 1) parts.push('مليون')
    else if (millions === 2) parts.push('مليونان')
    else if (millions >= 3 && millions <= 10)
      parts.push(convertUnderThousandAr(millions) + ' ملايين')
    else parts.push(convertUnderThousandAr(millions) + ' مليوناً')
  }

  if (thousands > 0) {
    if (thousands === 1) parts.push('ألف')
    else if (thousands === 2) parts.push('ألفان')
    else if (thousands >= 3 && thousands <= 10)
      parts.push(convertUnderThousandAr(thousands) + ' آلاف')
    else parts.push(convertUnderThousandAr(thousands) + ' ألفاً')
  }

  if (remainder > 0) {
    parts.push(convertUnderThousandAr(remainder))
  }

  let result = 'فقط ' + (parts.join(' و') || 'صفر') + ' ' + currency
  if (fractionPart > 0) {
    result += ' و' + convertUnderThousandAr(fractionPart) + ' ' + fractionCurrency
  }
  result += ' لا غير'
  return result
}

const onesEn = [
  '',
  'One',
  'Two',
  'Three',
  'Four',
  'Five',
  'Six',
  'Seven',
  'Eight',
  'Nine',
  'Ten',
  'Eleven',
  'Twelve',
  'Thirteen',
  'Fourteen',
  'Fifteen',
  'Sixteen',
  'Seventeen',
  'Eighteen',
  'Nineteen',
]

const tensEn = [
  '',
  '',
  'Twenty',
  'Thirty',
  'Forty',
  'Fifty',
  'Sixty',
  'Seventy',
  'Eighty',
  'Ninety',
]

function convertUnderThousandEn(n: number): string {
  let str = ''
  const h = Math.floor(n / 100)
  const rem = n % 100
  if (h > 0) {
    str += onesEn[h] + ' Hundred'
    if (rem > 0) str += ' and '
  }
  if (rem > 0) {
    if (rem < 20) {
      str += onesEn[rem]
    } else {
      str += tensEn[Math.floor(rem / 10)]
      if (rem % 10 > 0) str += '-' + onesEn[rem % 10]
    }
  }
  return str
}

export function numberToWordsEnglish(
  amount: number,
  currency = 'Saudi Riyals',
  fractionCurrency = 'Halalas'
): string {
  if (isNaN(amount) || amount === 0) return 'Zero ' + currency
  const num = Math.abs(amount)
  const integerPart = Math.floor(num)
  const fractionPart = Math.round((num - integerPart) * 100)

  const parts: string[] = []
  const millions = Math.floor(integerPart / 1000000)
  const thousands = Math.floor((integerPart % 1000000) / 1000)
  const remainder = integerPart % 1000

  if (millions > 0) {
    parts.push(convertUnderThousandEn(millions) + ' Million')
  }
  if (thousands > 0) {
    parts.push(convertUnderThousandEn(thousands) + ' Thousand')
  }
  if (remainder > 0) {
    parts.push(convertUnderThousandEn(remainder))
  }

  let result = 'Only ' + (parts.join(' ') || 'Zero') + ' ' + currency
  if (fractionPart > 0) {
    result += ' and ' + convertUnderThousandEn(fractionPart) + ' ' + fractionCurrency
  }
  result += '.'
  return result
}
