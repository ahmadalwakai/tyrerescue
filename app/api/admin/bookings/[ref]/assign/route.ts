import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, drivers, bookingStatusHistory, tyreProducts, bookingTyres, users } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { executeTransition, BookingStatus } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { driverAssigned, jobAssigned, jobCancelled } from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { notifyDriverNewJob } from '@/lib/notifications/driver-push';

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

    // Block assignment for terminal statuses only
    const terminalStatuses = ['completed', 'cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending'];
    if (terminalStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot assign driver to booking in status: ${currentStatus}` },
        { status: 400 }
      );
    }

    // If already has a driver (reassignment), just update the driver and timestamps
    if (currentStatus !== 'paid') {
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
        fromStatus: currentStatus,
        toStatus: currentStatus,
        actorUserId: session.user.id,
        actorRole: 'admin',
        note: `Driver reassigned (during ${currentStatus})`,
      });

      // Notify the newly assigned driver (non-blocking — reassignment succeeds regardless)
      notifyDriverNewJob(driverId, booking.refNumber, booking.addressLine).catch(() => {});

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

    // Admin notification for driver assignment
    await createAdminNotification({
      type: 'booking.updated',
      title: 'Driver Assigned',
      body: `${driverUser?.name || 'Driver'} assigned to booking ${booking.refNumber}`,
      entityType: 'booking',
      entityId: booking.id,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'info',
    });

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

    // Send push notification to driver's mobile app
    try {
      await notifyDriverNewJob(driverId, booking.refNumber, booking.addressLine);
    } catch (pushError) {
      console.error('Failed to send push notification to driver:', pushError);
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

// DELETE /api/admin/bookings/[ref]/assign — remove assigned driver
export async function DELETE(request: Request, { params }: Props) {
  try {
    const session = await requireAdmin();
    const { ref } = await params;

    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (!booking.driverId) {
      return NextResponse.json({ error: 'No driver assigned' }, { status: 400 });
    }

    // Only allow removal before driver starts working
    if (['en_route', 'arrived', 'in_progress'].includes(booking.status)) {
      return NextResponse.json(
        { error: `Cannot remove driver while job is ${booking.status}. Reassign instead.` },
        { status: 400 }
      );
    }

    const previousDriverId = booking.driverId;

    // Revert booking to paid status and clear driver + all lifecycle timestamps
    await db
      .update(bookings)
      .set({
        driverId: null,
        assignedAt: null,
        acceptedAt: null,
        acceptanceDeadline: null,
        enRouteAt: null,
        arrivedAt: null,
        inProgressAt: null,
        completedAt: null,
        status: 'paid',
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: 'paid',
      actorUserId: session.user.id,
      actorRole: 'admin',
      note: 'Driver removed by admin',
    });

    // Notify the removed driver
    try {
      const [driver] = await db.select().from(drivers).where(eq(drivers.id, previousDriverId)).limit(1);
      if (driver?.userId) {
        const [driverUser] = await db.select().from(users).where(eq(users.id, driver.userId)).limit(1);
        if (driverUser?.email) {
          const emailData = jobCancelled({
            driverName: driverUser.name || 'Driver',
            refNumber: booking.refNumber,
            customerAddress: booking.addressLine,
            reason: 'Driver assignment removed by admin',
          });
          await createNotificationAndSend({
            to: driverUser.email,
            subject: emailData.subject,
            html: emailData.html,
            type: 'job-cancelled',
            userId: driver.userId,
            bookingId: booking.id,
          });
        }
      }
    } catch (emailErr) {
      console.error('Failed to notify driver of removal:', emailErr);
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error removing driver:', error);
    return NextResponse.json({ error: 'Failed to remove driver' }, { status: 500 });
  }
}
