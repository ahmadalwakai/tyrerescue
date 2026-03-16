import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';

const regSchema = z
  .string()
  .min(2)
  .max(10)
  .transform((v) => v.replace(/\s+/g, '').toUpperCase());

interface MotTest {
  completedDate?: string;
  testResult?: string;
  odometerValue?: string;
  odometerUnit?: string;
}

interface DvsaVehicle {
  make?: string;
  model?: string;
  primaryColour?: string;
  fuelType?: string;
  registrationDate?: string;
  manufactureYear?: string;
  engineSize?: string;
  motTests?: MotTest[];
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
      `https://beta.check-mot.service.gov.uk/trade/vehicles/mot-tests?registration=${parsed.data}`,
      {
        headers: {
          Accept: 'application/json+v6',
          'x-api-key': apiKey,
        },
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

    const data: DvsaVehicle[] = await res.json();
    const vehicle = data?.[0];

    if (!vehicle) {
      return NextResponse.json(
        { error: 'Vehicle not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      make: vehicle.make || null,
      model: vehicle.model || null,
      colour: vehicle.primaryColour || null,
      fuelType: vehicle.fuelType || null,
      year: vehicle.manufactureYear || null,
    });
  } catch (err) {
    console.error('DVSA lookup error:', err);
    return NextResponse.json(
      { error: 'Vehicle lookup timed out' },
      { status: 504 }
    );
  }
}
