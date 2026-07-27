import { normalizeVrm } from '@/lib/vrm';
import { parseTyreSizeText } from '@/lib/vehicle-tyre-catalog';
import { saveConfirmedVrmFitmentRecord } from '@/lib/vehicle-fitment-store';
import type { TyreSize, Vehicle } from '@/types/vehicle';

interface ConfirmedTyreLineInput {
    id?: string | null;
    size: string;
    quantity?: number | null;
    axle?: string | null;
    loadIndex?: string | null;
    speedIndex?: string | null;
    runFlat?: boolean | null;
    xl?: boolean | null;
    commercial?: boolean | null;
}

interface ConfirmedFitmentInput {
  registrationNumber: string;
  vehicle: Vehicle;
  tyreSizes?: string[];
  tyreLines?: ConfirmedTyreLineInput[];
  confirmedAt?: Date;
  confirmedByUserId?: string | null;
  allowIdentityConflictOverwrite?: boolean;
}

interface ParsedConfirmedTyreLine {
  id: string;
  size: TyreSize;
  quantity: number;
  axle: string | null;
  loadIndex: string | null;
  speedIndex: string | null;
  runFlat: boolean | null;
  xl: boolean | null;
  commercial: boolean | null;
}

function tyreDisplay(size: TyreSize): string {
  return size.sizeDisplay ?? `${size.width}/${size.aspect}R${size.rim}${size.commercial ? 'C' : ''}`;
}

function optionKey(front: TyreSize, rear: TyreSize): string {
  return `${tyreDisplay(front)}|${tyreDisplay(rear)}`.toUpperCase();
}

function cleanText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function cleanBoolean(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

export async function saveConfirmedVrmFitment(
  input: ConfirmedFitmentInput
): Promise<{ registrationNumber: string; saved: boolean; optionCount: number; sizeDisplay: string }> {
  const registrationNumber = normalizeVrm(input.registrationNumber);
  const rawLines: ConfirmedTyreLineInput[] = input.tyreLines?.length
    ? input.tyreLines
    : (input.tyreSizes ?? []).map((size) => ({ size, quantity: 1 }));
  const parsedLines = rawLines
    .map((line, index) => {
      const size = parseTyreSizeText(line.size);
      if (!size) return null;
      const enrichedSize: TyreSize = {
        ...size,
        loadIndex: cleanText(line.loadIndex) ?? size.loadIndex,
        speedIndex: cleanText(line.speedIndex) ?? size.speedIndex,
        runFlat: cleanBoolean(line.runFlat) ?? size.runFlat,
        xl: cleanBoolean(line.xl) ?? size.xl,
        commercial: cleanBoolean(line.commercial) ?? size.commercial,
      };
      return {
        id: cleanText(line.id) ?? `tyre-${index + 1}`,
        size: enrichedSize,
        quantity: Math.max(1, Math.min(10, Math.round(Number(line.quantity) || 1))),
        axle: cleanText(line.axle),
        loadIndex: cleanText(line.loadIndex),
        speedIndex: cleanText(line.speedIndex),
        runFlat: cleanBoolean(line.runFlat),
        xl: cleanBoolean(line.xl),
        commercial: cleanBoolean(line.commercial) ?? enrichedSize.commercial ?? null,
      };
    })
    .filter((line): line is ParsedConfirmedTyreLine => Boolean(line));

  const uniqueSizes = Array.from(
    new Map(parsedLines.map((line) => [tyreDisplay(line.size).toUpperCase(), line.size])).values()
  );
  if (uniqueSizes.length === 0) {
    throw new Error('No valid tyre size was supplied.');
  }

  const front = uniqueSizes[0];
  const rear = uniqueSizes[1] ?? front;
  const now = input.confirmedAt ?? new Date();
  const today = now.toISOString().slice(0, 10);

  const sizeDisplay = tyreDisplay(front) === tyreDisplay(rear)
    ? tyreDisplay(front)
    : `Front ${tyreDisplay(front)} / Rear ${tyreDisplay(rear)}`;

  const result = await saveConfirmedVrmFitmentRecord({
    registrationNumber,
    vehicle: input.vehicle,
    confirmedAt: now,
    confirmedByUserId: input.confirmedByUserId ?? null,
    sizeDisplay,
    options: [
      {
      label: 'Sidewall confirmed in Assisted Chat',
      front: {
        ...front,
        sizeDisplay: tyreDisplay(front),
      },
      rear: {
        ...rear,
        sizeDisplay: tyreDisplay(rear),
      },
      confidence: 'high',
      oem: false,
      notes: [`Confirmed from tyre sidewall on ${today}.`],
      source: 'assisted_chat_sidewall',
      key: optionKey(front, rear),
      tyreLines: parsedLines.map((line) => ({
        id: line.id,
        size: tyreDisplay(line.size),
        quantity: line.quantity,
        axle: line.axle,
        loadIndex: line.loadIndex,
        speedIndex: line.speedIndex,
        runFlat: line.runFlat,
        xl: line.xl,
        commercial: line.commercial,
      })),
      },
    ],
    allowIdentityConflictOverwrite: input.allowIdentityConflictOverwrite,
  });

  return {
    registrationNumber: result.registrationNumber,
    saved: result.saved,
    optionCount: result.optionCount,
    sizeDisplay: result.sizeDisplay,
  };
}
