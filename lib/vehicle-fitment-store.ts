import { eq, sql } from 'drizzle-orm';
import type { db as appDb } from '@/lib/db';
import { vehicleTyreFitments, type VehicleTyreFitment } from '@/lib/db/schema';
import { normalizeVrm } from '@/lib/vrm';
import type { FuelType, Vehicle } from '@/types/vehicle';

type JsonRecord = Record<string, unknown>;
type FitmentWriteExecutor = Pick<typeof appDb, 'select' | 'insert' | 'update'>;
type FitmentLockExecutor = FitmentWriteExecutor & {
  execute?: (query: unknown) => Promise<unknown>;
};

export interface DvlaVehicleFingerprint {
  value: string;
  payload: {
    make: string | null;
    yearOfManufacture: number | null;
    fuelType: FuelType | string | null;
    /** Stored for operator context only; not part of the stable fingerprint. */
    colour: string | null;
  };
}

export interface ConfirmedFitmentStoreRecord {
  id: string;
  registrationNumber: string;
  vehicleFingerprint: string;
  vehicleFingerprintPayload: JsonRecord;
  make: string | null;
  model: string | null;
  yearOfManufacture: number | null;
  fuelType: string | null;
  colour: string | null;
  options: JsonRecord[];
  source: string;
  status: string;
  reviewHistory: JsonRecord[];
  confirmedAt: Date;
}

export type LoadConfirmedVrmFitmentResult =
  | { kind: 'match'; record: ConfirmedFitmentStoreRecord; messages: string[] }
  | { kind: 'mismatch'; record: ConfirmedFitmentStoreRecord; messages: string[] }
  | { kind: 'missing'; messages: string[] }
  | { kind: 'unavailable'; messages: string[] };

export type LoadConfirmedVrmFitmentByRegistrationResult =
  | { kind: 'found'; record: ConfirmedFitmentStoreRecord; messages: string[] }
  | { kind: 'missing'; messages: string[] }
  | { kind: 'unavailable'; messages: string[] };

export interface SaveConfirmedVrmFitmentInput {
  registrationNumber: string;
  vehicle: Vehicle;
  options: JsonRecord[];
  sizeDisplay: string;
  confirmedAt?: Date;
  confirmedByUserId?: string | null;
  allowIdentityConflictOverwrite?: boolean;
}

export interface SaveConfirmedVrmFitmentResult {
  registrationNumber: string;
  saved: boolean;
  optionCount: number;
  sizeDisplay: string;
  vehicleFingerprint: string;
}

export class VehicleFitmentIdentityConflictError extends Error {
  existingRecord: ConfirmedFitmentStoreRecord;
  conflictFields: string[];

  constructor(existingRecord: ConfirmedFitmentStoreRecord, conflictFields: string[]) {
    super('This registration has a previous confirmed vehicle identity. Review the conflict before replacing its tyre fitments.');
    this.name = 'VehicleFitmentIdentityConflictError';
    this.existingRecord = existingRecord;
    this.conflictFields = conflictFields;
  }
}

function cleanUpper(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function cleanModel(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function cleanYear(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

export function buildDvlaVehicleFingerprint(vehicle: {
  make?: string | null;
  yearOfManufacture?: number | null;
  fuelType?: FuelType | string | null;
  colour?: string | null;
}): DvlaVehicleFingerprint {
  const payload = {
    make: cleanUpper(vehicle.make),
    yearOfManufacture: cleanYear(vehicle.yearOfManufacture),
    fuelType: cleanUpper(vehicle.fuelType),
    colour: cleanUpper(vehicle.colour),
  };
  return {
    value: [
      `make=${payload.make ?? ''}`,
      `year=${payload.yearOfManufacture ?? ''}`,
      `fuel=${payload.fuelType ?? ''}`,
    ].join('|'),
    payload,
  };
}

function asJsonRecord(value: unknown): JsonRecord | null {
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as JsonRecord) : null;
}

function jsonArray(value: unknown): JsonRecord[] {
  return Array.isArray(value)
    ? value.map(asJsonRecord).filter((record): record is JsonRecord => Boolean(record))
    : [];
}

function rowToRecord(row: VehicleTyreFitment): ConfirmedFitmentStoreRecord {
  return {
    id: row.id,
    registrationNumber: row.registrationNumber,
    vehicleFingerprint: row.vehicleFingerprint,
    vehicleFingerprintPayload: asJsonRecord(row.vehicleFingerprintPayload) ?? {},
    make: row.make,
    model: row.model,
    yearOfManufacture: row.yearOfManufacture,
    fuelType: row.fuelType,
    colour: row.colour,
    options: jsonArray(row.options),
    source: row.source,
    status: row.status,
    reviewHistory: jsonArray(row.reviewHistory),
    confirmedAt: row.confirmedAt,
  };
}

function coerceFuelType(value: string | null): FuelType {
  if (value === 'PETROL' || value === 'DIESEL' || value === 'ELECTRIC' || value === 'HYBRID') return value;
  return 'OTHER';
}

export function vehicleFromConfirmedFitmentRecord(record: ConfirmedFitmentStoreRecord): Vehicle {
  return {
    registrationNumber: record.registrationNumber,
    make: record.make ?? 'UNKNOWN',
    model: record.model,
    yearOfManufacture: record.yearOfManufacture,
    fuelType: coerceFuelType(record.fuelType),
    colour: record.colour,
  };
}

function dbDisabled(): boolean {
  return (
    process.env.TYRE_FITMENT_DB === 'disabled' ||
    process.env.TYRE_CONFIRMED_FITMENT_DB === 'disabled' ||
    (process.env.NODE_ENV === 'test' && process.env.TYRE_CONFIRMED_FITMENT_DB !== 'enabled')
  );
}

function dbUnavailableMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/does not exist|relation .*vehicle_tyre_fitments/i.test(message)) {
    return 'Confirmed tyre fitment DB table is not migrated yet; using read-only catalog fallbacks.';
  }
  return 'Confirmed tyre fitment DB is unavailable; using read-only catalog fallbacks.';
}

function describeFingerprint(payload: JsonRecord): string {
  return [
    typeof payload.make === 'string' ? payload.make : null,
    typeof payload.yearOfManufacture === 'number' ? String(payload.yearOfManufacture) : null,
    typeof payload.fuelType === 'string' ? payload.fuelType : null,
    typeof payload.colour === 'string' ? payload.colour : null,
  ].filter(Boolean).join(' ');
}

function stableFieldText(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim().toUpperCase() : null;
}

function stableFieldNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null;
}

function recordStablePayload(record: ConfirmedFitmentStoreRecord): DvlaVehicleFingerprint['payload'] {
  const payload = asJsonRecord(record.vehicleFingerprintPayload) ?? {};
  return {
    make: stableFieldText(payload.make) ?? stableFieldText(record.make),
    yearOfManufacture: stableFieldNumber(payload.yearOfManufacture) ?? stableFieldNumber(record.yearOfManufacture),
    fuelType: stableFieldText(payload.fuelType) ?? stableFieldText(record.fuelType),
    colour: stableFieldText(payload.colour) ?? stableFieldText(record.colour),
  };
}

export function vehicleIdentityConflictFields(
  record: ConfirmedFitmentStoreRecord,
  vehicle: Vehicle
): string[] {
  const previous = recordStablePayload(record);
  const current = buildDvlaVehicleFingerprint(vehicle).payload;
  const fields: string[] = [];

  if (previous.make && current.make && previous.make !== current.make) fields.push('make');
  if (
    previous.yearOfManufacture != null &&
    current.yearOfManufacture != null &&
    previous.yearOfManufacture !== current.yearOfManufacture
  ) {
    fields.push('yearOfManufacture');
  }
  if (previous.fuelType && current.fuelType && previous.fuelType !== current.fuelType) fields.push('fuelType');

  return fields;
}

export function vehicleIdentityMatches(
  record: ConfirmedFitmentStoreRecord,
  vehicle: Vehicle
): boolean {
  return vehicleIdentityConflictFields(record, vehicle).length === 0;
}

export async function loadConfirmedVrmFitmentByRegistration(
  registrationNumber: string
): Promise<LoadConfirmedVrmFitmentByRegistrationResult> {
  if (dbDisabled()) return { kind: 'missing', messages: [] };

  const vrm = normalizeVrm(registrationNumber);
  try {
    const { db } = await import('@/lib/db');
    const [row] = await db
      .select()
      .from(vehicleTyreFitments)
      .where(eq(vehicleTyreFitments.registrationNumber, vrm))
      .limit(1);

    if (!row || row.status !== 'confirmed') return { kind: 'missing', messages: [] };

    return {
      kind: 'found',
      record: rowToRecord(row),
      messages: ['Found a previously sidewall-confirmed fitment for this registration.'],
    };
  } catch (error) {
    return { kind: 'unavailable', messages: [dbUnavailableMessage(error)] };
  }
}

export async function loadConfirmedVrmFitment(
  registrationNumber: string,
  vehicle: Vehicle
): Promise<LoadConfirmedVrmFitmentResult> {
  if (dbDisabled()) return { kind: 'missing', messages: [] };

  const vrm = normalizeVrm(registrationNumber);

  try {
    const { db } = await import('@/lib/db');
    const [row] = await db
      .select()
      .from(vehicleTyreFitments)
      .where(eq(vehicleTyreFitments.registrationNumber, vrm))
      .limit(1);

    if (!row || row.status !== 'confirmed') return { kind: 'missing', messages: [] };

    const record = rowToRecord(row);
    if (!vehicleIdentityMatches(record, vehicle)) {
      const oldVehicle = describeFingerprint(record.vehicleFingerprintPayload);
      return {
        kind: 'mismatch',
        record,
        messages: [
          oldVehicle
            ? `Previous confirmed tyre fitment was ignored because the DVLA vehicle fingerprint changed from ${oldVehicle}.`
            : 'Previous confirmed tyre fitment was ignored because the DVLA vehicle fingerprint changed.',
        ],
      };
    }

    return {
      kind: 'match',
      record,
      messages: ['Matched a previously sidewall-confirmed fitment for this DVLA vehicle fingerprint.'],
    };
  } catch (error) {
    return { kind: 'unavailable', messages: [dbUnavailableMessage(error)] };
  }
}

function optionSizeText(value: unknown): string | null {
  if (typeof value === 'string') return value.trim().toUpperCase() || null;
  const record = asJsonRecord(value);
  if (!record) return null;
  if (typeof record.sizeDisplay === 'string') return record.sizeDisplay.trim().toUpperCase();
  const width = typeof record.width === 'string' || typeof record.width === 'number' ? String(record.width) : null;
  const aspect = typeof record.aspect === 'string' || typeof record.aspect === 'number' ? String(record.aspect) : null;
  const rim = typeof record.rim === 'string' || typeof record.rim === 'number' ? String(record.rim) : null;
  if (!width || !aspect || !rim) return null;
  return `${width}/${aspect}R${rim}${record.commercial === true ? 'C' : ''}`.toUpperCase();
}

function optionKey(option: JsonRecord): string {
  const front = optionSizeText(option.front ?? option.size ?? option.tyreSize) ?? '';
  const rear = optionSizeText(option.rear) ?? front;
  return `${front}|${rear}`;
}

function mergeOptions(existing: JsonRecord[], incoming: JsonRecord[]): { options: JsonRecord[]; saved: boolean } {
  const options = [...existing];
  let saved = false;
  for (const option of incoming) {
    const key = optionKey(option);
    if (!key.trim() || options.some((candidate) => optionKey(candidate) === key)) continue;
    options.push(option);
    saved = true;
  }
  return { options, saved };
}

export async function saveConfirmedVrmFitmentRecord(
  input: SaveConfirmedVrmFitmentInput
): Promise<SaveConfirmedVrmFitmentResult> {
  const registrationNumber = normalizeVrm(input.registrationNumber);
  const now = input.confirmedAt ?? new Date();
  const fingerprint = buildDvlaVehicleFingerprint(input.vehicle);

  const { db } = await import('@/lib/db');

  if (typeof db.transaction !== 'function') {
    throw new Error('Confirmed tyre fitment writes require transaction support.');
  }

  try {
    return await db.transaction(async (tx) => {
      const executor = tx as FitmentLockExecutor;
      if (typeof executor.execute !== 'function') {
        throw new Error('Confirmed tyre fitment writes require transaction lock support.');
      }
      await executor.execute(sql`select pg_advisory_xact_lock(hashtext(${registrationNumber}))`);
      return persistConfirmedVrmFitmentRecord(executor, input, registrationNumber, now, fingerprint);
    });
  } catch (error) {
    if (error instanceof Error && error.message.includes('No transactions support')) {
      throw new Error('Confirmed tyre fitment writes require transaction support.');
    }
    throw error;
  }
}

async function persistConfirmedVrmFitmentRecord(
  db: FitmentWriteExecutor,
  input: SaveConfirmedVrmFitmentInput,
  registrationNumber: string,
  now: Date,
  fingerprint: DvlaVehicleFingerprint,
): Promise<SaveConfirmedVrmFitmentResult> {
  const [existing] = await db
    .select()
    .from(vehicleTyreFitments)
    .where(eq(vehicleTyreFitments.registrationNumber, registrationNumber))
    .limit(1);

  const existingRecord = existing ? rowToRecord(existing) : null;
  const sameVehicle = existingRecord ? vehicleIdentityMatches(existingRecord, input.vehicle) : false;
  const existingOptions = existingRecord && sameVehicle ? existingRecord.options : [];
  const merged = mergeOptions(existingOptions, input.options);
  const reviewHistory: JsonRecord[] = [...(existingRecord?.reviewHistory ?? [])];

  if (existingRecord && !sameVehicle) {
    const conflictFields = vehicleIdentityConflictFields(existingRecord, input.vehicle);
    reviewHistory.push({
      at: now.toISOString(),
      action: 'vehicle_fingerprint_changed',
      previousVehicleFingerprint: existingRecord.vehicleFingerprint,
      previousVehicleFingerprintPayload: existingRecord.vehicleFingerprintPayload,
      previousOptionCount: existingRecord.options.length,
      currentVehicleFingerprint: fingerprint.value,
      currentVehicleFingerprintPayload: fingerprint.payload,
      conflictFields,
    });

    if (!input.allowIdentityConflictOverwrite) {
      await db
        .update(vehicleTyreFitments)
        .set({
          reviewHistory,
          status: 'conflict_review',
          updatedAt: now,
        })
        .where(eq(vehicleTyreFitments.registrationNumber, registrationNumber));
      throw new VehicleFitmentIdentityConflictError(existingRecord, conflictFields);
    }
  }

  reviewHistory.push({
    at: now.toISOString(),
    action: merged.saved ? 'sidewall_fitment_confirmed' : 'sidewall_fitment_already_known',
    sizeDisplay: input.sizeDisplay,
    vehicleFingerprint: fingerprint.value,
    confirmedByUserId: input.confirmedByUserId ?? null,
  });

  const values = {
    registrationNumber,
    vehicleFingerprint: fingerprint.value,
    vehicleFingerprintPayload: fingerprint.payload,
    make: cleanUpper(input.vehicle.make),
    model: cleanModel(input.vehicle.model),
    yearOfManufacture: cleanYear(input.vehicle.yearOfManufacture),
    fuelType: cleanUpper(input.vehicle.fuelType),
    colour: cleanUpper(input.vehicle.colour),
    options: merged.options,
    source: 'assisted_chat_sidewall',
    status: 'confirmed',
    reviewHistory,
    confirmedBy: input.confirmedByUserId ?? null,
    confirmedAt: now,
    updatedAt: now,
  };

  if (existing) {
    await db
      .update(vehicleTyreFitments)
      .set(values)
      .where(eq(vehicleTyreFitments.registrationNumber, registrationNumber));
  } else {
    await db.insert(vehicleTyreFitments).values({
      ...values,
      createdAt: now,
    });
  }

  return {
    registrationNumber,
    saved: merged.saved,
    optionCount: merged.options.length,
    sizeDisplay: input.sizeDisplay,
    vehicleFingerprint: fingerprint.value,
  };
}
