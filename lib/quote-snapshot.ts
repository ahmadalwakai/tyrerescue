import { z } from 'zod';

const quoteTyreSelectionSnapshotSchema = z.object({
  tyreId: z.string().uuid(),
  quantity: z.coerce.number().int().min(1).max(20),
  unitPrice: z.coerce.number().finite().min(0),
  service: z.enum(['fit', 'repair', 'assess']),
  sizeDisplay: z.string().min(1).max(32).optional(),
  brand: z.string().min(1).max(100).optional(),
  pattern: z.string().min(1).max(200).optional(),
  isPreOrder: z.boolean().optional(),
});

const quoteTyreSelectionsSnapshotSchema = z.array(quoteTyreSelectionSnapshotSchema).max(20);

export type QuoteTyreSelectionSnapshot = z.infer<typeof quoteTyreSelectionSnapshotSchema>;

export interface ParsedQuoteTyreSelectionsResult {
  ok: boolean;
  data?: QuoteTyreSelectionSnapshot[];
  error?: string;
}

function normalizeMoney(value: number): number {
  return Math.round(value * 100) / 100;
}

export function normalizeQuoteTyreSelectionsSnapshot(
  selections: QuoteTyreSelectionSnapshot[]
): QuoteTyreSelectionSnapshot[] {
  return selections.map((selection) => ({
    ...selection,
    quantity: Math.trunc(selection.quantity),
    unitPrice: normalizeMoney(selection.unitPrice),
  }));
}

export function parseQuoteTyreSelectionsSnapshot(raw: unknown): ParsedQuoteTyreSelectionsResult {
  const parsed = quoteTyreSelectionsSnapshotSchema.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues
        .map((issue) => `${issue.path.join('.') || 'tyreSelections'}: ${issue.message}`)
        .join('; '),
    };
  }

  return {
    ok: true,
    data: normalizeQuoteTyreSelectionsSnapshot(parsed.data),
  };
}

export function buildQuoteTyreSelectionsSnapshot(
  selections: QuoteTyreSelectionSnapshot[]
): QuoteTyreSelectionSnapshot[] {
  const parsed = quoteTyreSelectionsSnapshotSchema.parse(selections);
  return normalizeQuoteTyreSelectionsSnapshot(parsed);
}
