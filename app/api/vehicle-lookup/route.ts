import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const regSchema = z
  .string()
  .min(2)
  .max(10)
  .transform((v) => v.replace(/\s+/g, '').toUpperCase());

interface DvlaVehicle {
  make?: string;
  colour?: string;
  fuelType?: string;
  yearOfManufacture?: number;
  engineCapacity?: number;
  monthOfFirstRegistration?: string;
  wheelplan?: string;
}

export async function GET(request: NextRequest) {
  const reg = request.nextUrl.searchParams.get('reg');

  const parsed = regSchema.safeParse(reg);
  if (!parsed.success) {
    return NextResponse.json(
      { error: 'Invalid registration' },
      { status: 400 }
    );
  }

  const apiKey = process.env.DVSA_MOT_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Vehicle lookup not configured' },
      { status: 503 }
    );
  }

  try {
    const res = await fetch(
      'https://driver-vehicle-licensing.api.gov.uk/vehicle-enquiry/v1/vehicles',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': apiKey,
        },
        body: JSON.stringify({ registrationNumber: parsed.data }),
        signal: AbortSignal.timeout(8000),
      }
    );

    if (res.status === 404) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      );
    }

    if (!res.ok) {
      return NextResponse.json(
        { error: 'Lookup failed' },
        { status: 502 }
      );
    }

    const vehicle: DvlaVehicle = await res.json();

    // Format engine capacity: 1995 → "2.0L"
    let engineSize: string | null = null;
    if (vehicle.engineCapacity) {
      engineSize = (vehicle.engineCapacity / 1000).toFixed(1) + 'L';
    }

    return NextResponse.json({
      make: vehicle.make || null,
      colour: vehicle.colour || null,
      fuelType: vehicle.fuelType || null,
      year: vehicle.yearOfManufacture?.toString() || null,
      engineSize,
    });
  } catch (err) {
    console.error('DVLA lookup error:', err);
    return NextResponse.json(
      { error: 'Vehicle lookup timed out' },
      { status: 504 }
    );
  }
}
