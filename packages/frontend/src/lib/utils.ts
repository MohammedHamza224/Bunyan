import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Resolves a locale string ensuring that Arabic mode uses Western Arabic numerals (0–9)
 * via the Unicode extension `-u-nu-latn`.
 * Accepts either a locale string ('ar', 'ar-SA', 'en', 'en-US') or a boolean isAr flag.
 */
export function resolveNumberLocale(locale: string | boolean = 'ar-SA'): string {
  if (typeof locale === 'boolean') {
    return locale ? 'ar-SA-u-nu-latn' : 'en-US'
  }
  const loc = String(locale || 'ar-SA').toLowerCase()
  if (loc.startsWith('ar')) {
    return 'ar-SA-u-nu-latn'
  }
  return loc.startsWith('en') ? 'en-US' : locale
}

/**
 * Returns the localized presentation symbol or abbreviation for a currency.
 * In Arabic mode: SAR -> 'ر.س'
 * In English mode: SAR -> 'SAR'
 * Other currencies adapt appropriately.
 */
export function getCurrencySymbol(
  currency: string = 'SAR',
  locale: string | boolean = 'ar'
): string {
  const isAr = typeof locale === 'boolean' ? locale : String(locale || 'ar').toLowerCase().startsWith('ar')
  const curr = (currency || 'SAR').toUpperCase()
  if (curr === 'SAR') {
    return isAr ? 'ر.س' : 'SAR'
  }
  if (curr === 'USD') {
    return isAr ? 'US$' : '$'
  }
  if (curr === 'EUR') {
    return '€'
  }
  if (curr === 'AED') {
    return isAr ? 'د.إ' : 'AED'
  }
  if (curr === 'KWD') {
    return isAr ? 'د.ك' : 'KWD'
  }
  if (curr === 'BHD') {
    return isAr ? 'د.ب' : 'BHD'
  }
  if (curr === 'QAR') {
    return isAr ? 'ر.ق' : 'QAR'
  }
  if (curr === 'OMR') {
    return isAr ? 'ر.ع' : 'OMR'
  }
  return curr
}

/**
 * Formats a monetary amount using Western digits (0–9) while preserving Arabic / English currency context.
 * In Arabic: '1,234.56 ر.س'
 * In English: 'SAR 1,234.56'
 */
export function formatCurrency(
  amount: number | string | undefined,
  locale: string | boolean = 'ar-SA',
  currency = 'SAR'
): string {
  const num = Number(amount ?? 0)
  const targetLocale = resolveNumberLocale(locale)
  const validNum = isNaN(num) ? 0 : num
  const safeCurrency = (currency || 'SAR').trim().toUpperCase()

  try {
    return new Intl.NumberFormat(targetLocale, {
      style: 'currency',
      currency: safeCurrency,
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(validNum)
  } catch {
    const symbol = getCurrencySymbol(safeCurrency, locale)
    const isAr = typeof locale === 'boolean' ? locale : String(locale || 'ar').toLowerCase().startsWith('ar')
    return isAr ? `${validNum.toFixed(2)} ${symbol}` : `${symbol} ${validNum.toFixed(2)}`
  }
}

/**
 * Formats a date using Western digits (0–9) with localized Arabic or English month/day names.
 */
export function formatDate(date: string | Date | null | undefined, locale: string | boolean = 'ar-SA'): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
  const targetLocale = resolveNumberLocale(locale)
  try {
    return new Intl.DateTimeFormat(targetLocale, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    }).format(d)
  } catch {
    return d.toISOString().split('T')[0]
  }
}

/**
 * Formats a short numeric date (e.g. 2026/10/25) using Western digits (0–9).
 */
export function formatShortDate(date: string | Date | null | undefined, locale: string | boolean = 'ar-SA'): string {
  if (!date) return '—'
  const d = typeof date === 'string' ? new Date(date) : date
  if (!(d instanceof Date) || isNaN(d.getTime())) return '—'
  const targetLocale = resolveNumberLocale(locale)
  try {
    return new Intl.DateTimeFormat(targetLocale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(d)
  } catch {
    return d.toISOString().split('T')[0]
  }
}

/**
 * Formats the current date for application display in Saudi Arabia business timezone (Asia/Riyadh).
 * Arabic: "السبت، 24 أكتوبر 2026"
 * English: "Saturday, October 24, 2026"
 */
export function formatCurrentDate(
  date: Date | string | number = new Date(),
  locale: string = 'ar',
  timeZone: string = 'Asia/Riyadh'
): string {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const isAr = String(locale).toLowerCase().startsWith('ar')
  const targetLocale = isAr ? 'ar-SA-u-nu-latn' : 'en-US'

  try {
    return new Intl.DateTimeFormat(targetLocale, {
      timeZone,
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    }).format(d)
  } catch {
    try {
      return new Intl.DateTimeFormat(targetLocale, {
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric',
      }).format(d)
    } catch {
      return d.toISOString().split('T')[0]
    }
  }
}

/**
 * Formats the current time in 12-hour format for application display in Saudi Arabia business timezone (Asia/Riyadh).
 * Arabic: "10:46 ص"
 * English: "10:46 AM"
 */
export function formatCurrentTime(
  date: Date | string | number = new Date(),
  locale: string = 'ar',
  timeZone: string = 'Asia/Riyadh'
): string {
  const d = date instanceof Date ? date : new Date(date)
  if (isNaN(d.getTime())) return ''
  const isAr = String(locale).toLowerCase().startsWith('ar')
  const targetLocale = isAr ? 'ar-SA-u-nu-latn' : 'en-US'

  try {
    return new Intl.DateTimeFormat(targetLocale, {
      timeZone,
      hour: 'numeric',
      minute: '2-digit',
      hour12: true,
    }).format(d)
  } catch {
    try {
      return new Intl.DateTimeFormat(targetLocale, {
        hour: 'numeric',
        minute: '2-digit',
        hour12: true,
      }).format(d)
    } catch {
      return ''
    }
  }
}

/**
 * Formats a decimal number using Western digits (0–9).
 * Safely normalizes minimumFractionDigits and maximumFractionDigits to prevent Intl RangeErrors.
 */
export function formatNumber(
  value: number | string | undefined,
  locale: string | boolean = 'ar-SA',
  options?: Intl.NumberFormatOptions
): string {
  const num = Number(value ?? 0)
  const validNum = isNaN(num) ? 0 : num
  const targetLocale = resolveNumberLocale(locale)

  let minFractionDigits = options?.minimumFractionDigits
  let maxFractionDigits = options?.maximumFractionDigits

  if (minFractionDigits === undefined && maxFractionDigits === undefined) {
    minFractionDigits = 2
    maxFractionDigits = 2
  } else if (minFractionDigits === undefined && maxFractionDigits !== undefined) {
    minFractionDigits = Math.min(2, maxFractionDigits)
  } else if (minFractionDigits !== undefined && maxFractionDigits === undefined) {
    maxFractionDigits = Math.max(minFractionDigits, 2)
  } else if (minFractionDigits !== undefined && maxFractionDigits !== undefined) {
    if (minFractionDigits > maxFractionDigits) {
      minFractionDigits = maxFractionDigits
    }
  }

  try {
    return new Intl.NumberFormat(targetLocale, {
      ...options,
      minimumFractionDigits: minFractionDigits,
      maximumFractionDigits: maxFractionDigits,
    }).format(validNum)
  } catch {
    return validNum.toLocaleString('en-US', options)
  }
}

/**
 * Formats an integer count/quantity using Western digits (0–9) and thousands grouping separators.
 */
export function formatCount(
  value: number | string | undefined,
  locale: string | boolean = 'ar-SA'
): string {
  const num = Number(value ?? 0)
  const validNum = isNaN(num) ? 0 : num
  const targetLocale = resolveNumberLocale(locale)
  try {
    return new Intl.NumberFormat(targetLocale, {
      useGrouping: true,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(validNum)
  } catch {
    return Math.round(validNum).toString()
  }
}

/**
 * Formats a percentage using Western digits (0–9) and '%' symbol.
 */
export function formatPercent(
  value: number | string | undefined,
  decimals = 1
): string {
  const num = Number(value ?? 0)
  return `${num.toFixed(decimals)}%`
}

export function getErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message
  if (typeof error === 'string') return error
  return 'An unexpected error occurred'
}

export function getApiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const axiosError = error as { response?: { data?: { message?: string; error?: string } } }
    return axiosError.response?.data?.message || axiosError.response?.data?.error || 'Server error'
  }
  return getErrorMessage(error)
}
