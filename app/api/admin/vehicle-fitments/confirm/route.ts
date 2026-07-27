import { z } from 'zod';
import { requireAdminMobile } from '@/lib/auth';
import { expoDevCorsPreflight, jsonWithExpoDevCors } from '@/lib/api/dev-cors';
import { lookupVrm, normalizeVrm } from '@/lib/dvla';
import { saveConfirmedVrmFitment } from '@/lib/vehicle-fitment-confirmation';
import {
  VehicleFitmentIdentityConflictError,
} from '@/lib/vehicle-fitment-store';
import type { FuelType, Vehicle } from '@/types/vehicle';

export const runtime = 'nodejs';

const vehicleSchema = z.object({
  registrationNumber: z.string().optional(),
  make: z.string().optional().nullable(),
  model: z.string().optional().nullable(),
  yearOfManufacture: z.number().optional().nullable(),
  fuelType: z.string().optional().nullable(),
  colour: z.string().optional().nullable(),
}).optional().nullable();

const bodySchema = z.object({
  registrationNumber: z.string().min(2).max(24),
  vehicle: vehicleSchema,
  tyreLines: z.array(z.object({
    id: z.string().max(40).nullable().optional(),
    size: z.string().min(4).max(32),
    quantity: z.number().int().min(1).max(10).optional(),
    axle: z.string().max(20).nullable().optional(),
    loadIndex: z.string().max(8).nullable().optional(),
    speedIndex: z.string().max(8).nullable().optional(),
    runFlat: z.boolean().nullable().optional(),
    xl: z.boolean().nullable().optional(),
    commercial: z.boolean().nullable().optional(),
  })).min(1).max(4).optional(),
  tyreSizes: z.array(z.string().min(4).max(32)).min(1).max(4).optional(),
  allowIdentityConflictOverwrite: z.boolean().optional(),
}).refine((value) => Boolean(value.tyreSizes?.length || value.tyreLines?.length), {
  message: 'At least one tyre size is required.',
});

function coerceFuelType(value: unknown): FuelType {
  const fuel = typeof value === 'string' ? value.toUpperCase() : '';
  if (fuel === 'PETROL' || fuel === 'DIESEL' || fuel === 'ELECTRIC' || fuel === 'HYBRID') return fuel;
  return 'OTHER';
}

function manualVehicleFromBody(
  registrationNumber: string,
  vehicle: z.infer<typeof vehicleSchema>,
): Vehicle | null {
  const make = typeof vehicle?.make === 'string' ? vehicle.make.trim().toUpperCase() : '';
  if (!make) return null;
  return {
    registrationNumber,
    make,
    model:
      typeof vehicle?.model === 'string' && vehicle.model.trim()
        ? vehicle.model.trim().toUpperCase()
        : null,
    yearOfManufacture:
      typeof vehicle?.yearOfManufacture === 'number' && Number.isFinite(vehicle.yearOfManufacture)
        ? Math.trunc(vehicle.yearOfManufacture)
        : null,
    fuelType: coerceFuelType(vehicle?.fuelType),
    colour:
      typeof vehicle?.colour === 'string' && vehicle.colour.trim()
        ? vehicle.colour.trim().toUpperCase()
        : null,
  };
}

export async function POST(request: Request) {
  let session: Awaited<ReturnType<typeof requireAdminMobile>>;
  try {
    session = await requireAdminMobile(request);
  } catch {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { message: 'Unauthorized' } },
      { status: 401 },
    );
  }

  let json: unknown;
  try {
    json = await request.json();
  } catch {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { message: 'Invalid JSON body.' } },
      { status: 400 },
    );
  }

  const parsed = bodySchema.safeParse(json);
  if (!parsed.success) {
    return jsonWithExpoDevCors(
      request,
      { ok: false, error: { message: parsed.error.issues[0]?.message ?? 'Invalid fitment confirmation.' } },
      { status: 400 },
    );
  }

  const tyreLines = parsed.data.tyreLines ?? parsed.data.tyreSizes?.map((size) => ({ size, quantity: 1 })) ?? [];
  const registrationNumber = normalizeVrm(parsed.data.registrationNumber);
  const dvla = await lookupVrm(registrationNumber);
  const manualVehicle = manualVehicleFromBody(registrationNumber, parsed.data.vehicle);
  if (!dvla.ok && !manualVehicle) {
    return jsonWithExpoDevCors(
      request,
      {
        ok: false,
        error: {
          message: `Could not bind this fitment to a vehicle identity: ${dvla.error.message}. Enter the vehicle make and model manually, then confirm the sidewall again.`,
        },
      },
      { status: 400 },
    );
  }

  const chosenModel =
    typeof parsed.data.vehicle?.model === 'string' && parsed.data.vehicle.model.trim()
      ? parsed.data.vehicle.model.trim().toUpperCase()
      : dvla.ok
      ? dvla.vehicle.model
      : manualVehicle?.model ?? null;
  const vehicle: Vehicle = dvla.ok
    ? {
        ...dvla.vehicle,
        model: chosenModel,
      }
    : {
        ...(manualVehicle as Vehicle),
        model: chosenModel,
      };

  if (!vehicle.model) {
    return jsonWithExpoDevCors(
      request,
      {
        ok: false,
        error: {
          message: 'Choose the vehicle model or variant before saving this confirmed fitment.',
        },
      },
      { status: 400 },
    );
  }

  try {
    const saved = await saveConfirmedVrmFitment({
      registrationNumber,
      vehicle,
      tyreLines,
      confirmedByUserId: session.user.id,
      allowIdentityConflictOverwrite: parsed.data.allowIdentityConflictOverwrite,
    });
    return jsonWithExpoDevCors(request, { ok: true, ...saved });
  } catch (error) {
    if (error instanceof VehicleFitmentIdentityConflictError) {
      return jsonWithExpoDevCors(
        request,
        {
          ok: false,
          error: {
            code: 'identity_conflict',
            message: error.message,
            conflictFields: error.conflictFields,
          },
        },
        { status: 409 },
      );
    }
    return jsonWithExpoDevCors(
      request,
      {
        ok: false,
        error: {
          message: error instanceof Error ? error.message : 'Could not save verified tyre fitment.',
        },
      },
      { status: 400 },
    );
  }
}

export async function OPTIONS(request: Request) {
  return expoDevCorsPreflight(request);
}
