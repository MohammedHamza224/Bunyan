import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount: number, locale = 'ar-SA', currency = 'SAR'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)
}

export function formatDate(date: string | Date, locale = 'ar-SA'): string {
  const d = typeof date === 'string' ? new Date(date) : date
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  }).format(d)
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
  const isAr = String(locale).toLowerCase().startsWith('ar')
  const targetLocale = isAr ? 'ar-SA-u-nu-latn' : 'en-US'

  return new Intl.DateTimeFormat(targetLocale, {
    timeZone,
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(d)
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
  const isAr = String(locale).toLowerCase().startsWith('ar')
  const targetLocale = isAr ? 'ar-SA-u-nu-latn' : 'en-US'

  return new Intl.DateTimeFormat(targetLocale, {
    timeZone,
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  }).format(d)
}

export function formatNumber(value: number, locale = 'ar-SA'): string {
  return new Intl.NumberFormat(locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value)
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
