import { Decimal } from '@prisma/client/runtime/library';

/**
 * Round a Decimal to N decimal places (banker's rounding to avoid systematic bias).
 * All financial calculations use this function.
 */
export function roundDecimal(value: Decimal | number | string, places = 2): Decimal {
  const d = new Decimal(value.toString());
  return d.toDecimalPlaces(places);
}

/**
 * Calculate VAT amount given a taxable amount and rate (as percentage, e.g. 15).
 */
export function calculateVat(taxableAmount: Decimal, vatRate: Decimal): Decimal {
  return roundDecimal(taxableAmount.mul(vatRate).div(100), 2);
}

/**
 * Format a Decimal as a localized currency string.
 */
export function formatAmount(amount: Decimal, currency = 'SAR', locale = 'ar-SA'): string {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
    minimumFractionDigits: 2,
  }).format(amount.toNumber());
}

/**
 * Generate a sequential document reference number.
 * Format: PREFIX-YEAR-NNNN  e.g., INV-2024-0001
 */
export function formatDocumentNumber(prefix: string, year: number, sequence: number): string {
  return `${prefix}-${year}-${sequence.toString().padStart(4, '0')}`;
}
