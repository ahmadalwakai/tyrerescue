import { NextResponse } from 'next/server';
import { getOutboundUrl } from '@/lib/config/site';
import { requireAdmin, requireAdminMobile, hashPassword } from '@/lib/auth';
import { db, users, drivers, bookings } from '@/lib/db';
import { eq, inArray } from 'drizzle-orm';
import { createNotificationAndSend } from '@/lib/email/resend';
import { driverWelcome } from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { haversineDistanceMiles } from '@/lib/mapbox';
import { GARAGE_LOCATION } from '@/lib/garage';
import {
  ACTIVE_DRIVER_SITUATION_STATUSES,
  calculateDriverSituation,
  estimateUrbanDriveMinutesFromMiles,
} from '@/lib/admin/driverSituation';

function toNumber(value: string | number | null | undefined): number | null {
  if (value == null) return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/** GET /api/admin/drivers — list all drivers (Bearer or session auth) */
export async function GET(request: Request) {
  try {
    await requireAdminMobile(request);
    const rows = await db
      .select({
        id: drivers.id,
        name: users.name,
        phone: users.phone,
        isOnline: drivers.isOnline,
        status: drivers.status,
        currentLat: drivers.currentLat,
        currentLng: drivers.currentLng,
        locationAt: drivers.locationAt,
      })
      .from(drivers)
      .innerJoin(users, eq(drivers.userId, users.id));

    const activeBookings = await db
      .select({
        driverId: bookings.driverId,
        refNumber: bookings.refNumber,
        status: bookings.status,
        serviceType: bookings.serviceType,
        quantity: bookings.quantity,
        paymentType: bookings.paymentType,
        customerLat: bookings.lat,
        customerLng: bookings.lng,
      })
      .from(bookings)
      .where(inArray(bookings.status, [...ACTIVE_DRIVER_SITUATION_STATUSES]));
    const activeBookingByDriver = new Map(
      activeBookings
        .filter((booking) => booking.driverId)
        .map((booking) => [booking.driverId!, booking]),
    );

    return NextResponse.json(rows.map((driver) => {
      const activeBooking = activeBookingByDriver.get(driver.id) ?? null;
      const customerLat = toNumber(activeBooking?.customerLat);
      const customerLng = toNumber(activeBooking?.customerLng);
      const driverLat = toNumber(driver.currentLat);
      const driverLng = toNumber(driver.currentLng);
      const outboundMinutes =
        activeBooking && customerLat != null && customerLng != null && driverLat != null && driverLng != null
          ? estimateUrbanDriveMinutesFromMiles(
              haversineDistanceMiles(
                { lat: driverLat, lng: driverLng },
                { lat: customerLat, lng: customerLng },
              ),
            )
          : null;
      const returnMinutes =
        activeBooking && customerLat != null && customerLng != null
          ? estimateUrbanDriveMinutesFromMiles(
              haversineDistanceMiles(
                { lat: customerLat, lng: customerLng },
                { lat: GARAGE_LOCATION.lat, lng: GARAGE_LOCATION.lng },
              ),
            )
          : null;

      return {
        ...driver,
        activeJobRef: activeBooking?.refNumber ?? null,
        driverSituation: activeBooking
          ? calculateDriverSituation({
              jobRef: activeBooking.refNumber,
              driverId: driver.id,
              bookingStatus: activeBooking.status,
              driverIsOnline: driver.isOnline ?? false,
              driverStatus: driver.status ?? null,
              lastLocationAt: driver.locationAt ?? null,
              outboundMinutes,
              returnMinutes,
              serviceType: activeBooking.serviceType,
              tyreCount: activeBooking.quantity,
              paymentStatus: activeBooking.paymentType,
              returnEstimateAvailable: returnMinutes != null,
              routeAvailable: outboundMinutes != null,
              garageConfigured: true,
            })
          : null,
      };
    }));
  } catch {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await requireAdmin();
    const { name, email, phone, password } = await request.json();

    // Validate required fields
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      return NextResponse.json(
        { error: 'Name is required' },
        { status: 400 }
      );
    }

    if (!email || typeof email !== 'string' || !email.includes('@')) {
      return NextResponse.json(
        { error: 'Valid email is required' },
        { status: 400 }
      );
    }

    if (!phone || typeof phone !== 'string' || phone.trim().length === 0) {
      return NextResponse.json(
        { error: 'Phone number is required' },
        { status: 400 }
      );
    }

    if (!password || typeof password !== 'string' || password.length < 8) {
      return NextResponse.json(
        { error: 'Password must be at least 8 characters' },
        { status: 400 }
      );
    }

    // Check if email already exists
    const [existingUser] = await db
      .select({ id: users.id })
      .from(users)
      .where(eq(users.email, email.toLowerCase()))
      .limit(1);

    if (existingUser) {
      return NextResponse.json(
        { error: 'A user with this email already exists' },
        { status: 409 }
      );
    }

    // Hash password
    const passwordHash = await hashPassword(password);

    // Create user with driver role
    const [newUser] = await db
      .insert(users)
      .values({
        email: email.toLowerCase(),
        passwordHash,
        name: name.trim(),
        phone: phone.trim(),
        role: 'driver',
        emailVerified: true, // Admin-created accounts are pre-verified
      })
      .returning({ id: users.id });

    if (!newUser) {
      return NextResponse.json(
        { error: 'Failed to create user account' },
        { status: 500 }
      );
    }

    // Create driver record
    const [newDriver] = await db
      .insert(drivers)
      .values({
        userId: newUser.id,
        createdBy: session.user.id,
        isOnline: false,
        status: 'offline',
      })
      .returning({ id: drivers.id });

    // Send welcome email to driver with credentials
    try {
      const siteUrl = getOutboundUrl();
      const welcomeEmail = driverWelcome({
        name: name.trim(),
        email: email.toLowerCase(),
        password, // Send plain password - only sent once at account creation
        portalUrl: `${siteUrl}/driver`,
      });

      await createNotificationAndSend({
        to: email.toLowerCase(),
        subject: welcomeEmail.subject,
        html: welcomeEmail.html,
        type: 'driver-welcome',
        userId: newUser.id,
      });
    } catch (emailError) {
      console.error('Failed to send driver welcome email:', emailError);
    }

    // Admin notification
    await createAdminNotification({
      type: 'driver.status.changed',
      title: 'New Driver Registered',
      body: `${name.trim()} (${email.toLowerCase()}) has been added`,
      entityType: 'driver',
      entityId: newDriver.id,
      link: `/admin/drivers/${newDriver.id}`,
      severity: 'info',
    });

    return NextResponse.json({
      success: true,
      driver: {
        id: newDriver.id,
        userId: newUser.id,
        name: name.trim(),
        email: email.toLowerCase(),
      },
    });
  } catch (error) {
    console.error('Error creating driver:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create driver' },
      { status: 500 }
    );
  }
}
