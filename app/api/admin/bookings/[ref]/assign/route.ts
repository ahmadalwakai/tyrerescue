import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, drivers, bookingStatusHistory, tyreProducts, bookingTyres, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { executeTransition, BookingStatus } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { driverAssigned, jobAssigned } from '@/lib/email/templates';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const session = await requireAdmin();
    const { ref } = await params;
    const { driverId } = await request.json();

    if (!driverId) {
      return NextResponse.json(
        { error: 'Driver ID is required' },
        { status: 400 }
      );
    }

    // Verify driver exists and get details
    const [driver] = await db
      .select()
      .from(drivers)
      .where(eq(drivers.id, driverId))
      .limit(1);

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver not found' },
        { status: 404 }
      );
    }

    if (!driver.userId) {
      return NextResponse.json(
        { error: 'Driver has no associated user account' },
        { status: 400 }
      );
    }

    // Get driver user details for email
    const [driverUser] = await db
      .select()
      .from(users)
      .where(eq(users.id, driver.userId))
      .limit(1);

    // Get booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json(
        { error: 'Booking not found' },
        { status: 404 }
      );
    }

    const currentStatus = booking.status as BookingStatus;

    // Check if booking is in a state that allows assignment
    // Allow assignment from 'paid' or 'driver_assigned' (for reassignment)
    if (!['paid', 'driver_assigned'].includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot assign driver to booking in status: ${currentStatus}` },
        { status: 400 }
      );
    }

    // If already in driver_assigned state, just update the driver
    if (currentStatus === 'driver_assigned') {
      const now = new Date();
      await db
        .update(bookings)
        .set({
          driverId,
          assignedAt: now,
          acceptedAt: null,
          acceptanceDeadline: new Date(now.getTime() + 10 * 60 * 1000),
          updatedAt: now,
        })
        .where(eq(bookings.id, booking.id));

      // Log the reassignment
      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: 'driver_assigned',
        toStatus: 'driver_assigned',
        actorUserId: session.user.id,
        actorRole: 'admin',
        note: 'Driver reassigned',
      });

      return NextResponse.json({ success: true, reassigned: true });
    }

    // Transition from paid to driver_assigned
    const now = new Date();
    await db
      .update(bookings)
      .set({
        driverId,
        assignedAt: now,
        acceptedAt: null,
        acceptanceDeadline: new Date(now.getTime() + 10 * 60 * 1000),
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id));

    const result = await executeTransition(
      booking.id,
      'driver_assigned',
      { userId: session.user.id, role: 'admin' },
      `Driver assigned by admin`
    );

    if (!result.success) {
      return NextResponse.json(
        { error: result.error },
        { status: 400 }
      );
    }

    // Send notification emails
    const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
    const trackingUrl = `${siteUrl}/tracking/${booking.refNumber}`;

    // Get tyre summary for job assigned email
    const [bookingTyre] = await db
      .select()
      .from(bookingTyres)
      .where(eq(bookingTyres.bookingId, booking.id))
      .limit(1);

    let tyreSizeDisplay = 'N/A';
    if (bookingTyre?.tyreId) {
      const [tyre] = await db
        .select()
        .from(tyreProducts)
        .where(eq(tyreProducts.id, bookingTyre.tyreId))
        .limit(1);
      if (tyre) {
        tyreSizeDisplay = tyre.sizeDisplay;
      }
    }

    // Send driverAssigned email to customer
    try {
      const customerEmail = driverAssigned({
        customerName: booking.customerName,
        driverName: driverUser?.name || 'Your driver',
        driverPhone: driverUser?.phone || '0141 266 0690',
        etaMinutes: booking.bookingType === 'emergency' ? 45 : undefined,
        trackingUrl,
        refNumber: booking.refNumber,
      });

      await createNotificationAndSend({
        to: booking.customerEmail,
        subject: customerEmail.subject,
        html: customerEmail.html,
        type: 'driver-assigned',
        userId: booking.userId,
        bookingId: booking.id,
      });
    } catch (emailError) {
      console.error('Failed to send driver assigned email to customer:', emailError);
    }

    // Send jobAssigned email to driver
    if (driverUser?.email) {
      try {
        const driverEmail = jobAssigned({
          driverName: driverUser.name || 'Driver',
          refNumber: booking.refNumber,
          customerAddress: booking.addressLine,
          customerLat: parseFloat(booking.lat),
          customerLng: parseFloat(booking.lng),
          tyreSizeDisplay,
          quantity: booking.quantity,
          serviceType: booking.serviceType,
          customerPhone: booking.customerPhone,
          lockingNutStatus: booking.lockingNutStatus,
        });

        await createNotificationAndSend({
          to: driverUser.email,
          subject: driverEmail.subject,
          html: driverEmail.html,
          type: 'job-assigned',
          userId: driver.userId,
          bookingId: booking.id,
        });
      } catch (emailError) {
        console.error('Failed to send job assigned email to driver:', emailError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error assigning driver:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to assign driver' },
      { status: 500 }
    );
  }
}
