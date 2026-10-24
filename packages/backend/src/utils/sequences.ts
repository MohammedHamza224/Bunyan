import { v4 as uuidv4 } from 'uuid';

/**
 * Generate a unique idempotency key for payment dedup.
 */
export function generateIdempotencyKey(): string {
  return uuidv4();
}

/**
 * Generate a document reference number using the DB sequence.
 * This must be called within a transaction to be safe.
 */
export async function getNextSequenceNumber(
  tx: any,
  organizationId: string,
  docType: string
): Promise<{ referenceNo: string; sequence: number }> {
  const currentYear = new Date().getFullYear();

  // Upsert sequence row and increment atomically
  const seq = await tx.documentSequence.upsert({
    where: { organizationId_docType: { organizationId, docType } },
    update: {
      lastNumber: {
        increment: 1,
      },
      currentYear: {
        set: currentYear,
      },
    },
    create: {
      organizationId,
      docType,
      prefix: docType === 'invoice' ? 'INV' : docType === 'statement' ? 'STM' : 'WRK',
      lastNumber: 1,
      currentYear,
    },
  });

  // If year changed and yearReset is true, reset to 1
  if (seq.yearReset && seq.currentYear !== currentYear) {
    const reset = await tx.documentSequence.update({
      where: { organizationId_docType: { organizationId, docType } },
      data: { lastNumber: 1, currentYear },
    });
    const referenceNo = `${reset.prefix}-${currentYear}-${String(1).padStart(4, '0')}`;
    return { referenceNo, sequence: 1 };
  }

  const referenceNo = `${seq.prefix}-${currentYear}-${String(seq.lastNumber).padStart(4, '0')}`;
  return { referenceNo, sequence: seq.lastNumber };
}
