import { NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { db, bookings, drivers, bookingStatusHistory, tyreProducts, bookingTyres, users } from '@/lib/db';
import { getMobileAdminUser, unauthorizedResponse } from '@/app/api/mobile/admin/_lib';
import { executeTransition, type BookingStatus } from '@/lib/state-machine';
import { notifyDriverNewJob, notifyDriverReassignment } from '@/lib/notifications/driver-push';
import { computeDriverPaymentSummary } from '@/lib/payments/driver-payment';
import { getBookingPaymentEvidence } from '@/lib/payments/payment-evidence';
import { getOutboundUrl } from '@/lib/config/site';
import { createNotificationAndSend } from '@/lib/email/resend';
import { driverAssigned, jobAssigned } from '@/lib/email/templates';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;
  const body = await request.json();
  const driverId = String(body?.driverId || '');

  if (!driverId) {
    return NextResponse.json({ error: 'driverId is required' }, { status: 400 });
  }

  const [driver] = await db.select().from(drivers).where(eq(drivers.id, driverId)).limit(1);
  if (!driver) {
    return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
  }

  // Driver user details (email/name/phone) for assignment emails.
  const [driverUser] = driver.userId
    ? await db.select().from(users).where(eq(users.id, driver.userId)).limit(1)
    : [undefined];

  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }

  const currentStatus = booking.status as BookingStatus;
  const now = new Date();
  const paymentEvidence = await getBookingPaymentEvidence(booking.id);

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

  // Build the payment summary so the driver app can render "Collect £X"
  // inline from the FCM data payload without a follow-up fetch.
  const driverPayment = computeDriverPaymentSummary({
    paymentType: booking.paymentType,
    totalAmount: booking.totalAmount?.toString() ?? null,
    subtotal: booking.subtotal?.toString() ?? null,
    vatAmount: booking.vatAmount?.toString() ?? null,
    depositAmountPence: booking.depositAmountPence,
    remainingBalancePence: booking.remainingBalancePence,
    depositPaidAt: booking.depositPaidAt,
    stripePiId: booking.stripePiId,
    paymentStatus: paymentEvidence.paymentStatus,
    totalPaidPence: paymentEvidence.totalPaidPence,
    bookingStatus: currentStatus,
  });

  if (currentStatus === 'paid') {
    const result = await executeTransition(
      booking.id,
      'driver_assigned',
      { userId: user.id, role: 'admin' },
      'Driver assigned by mobile admin app',
    );

    if (!result.success) {
      return NextResponse.json({ error: result.error || 'Unable to assign driver' }, { status: 400 });
    }

    // Wake the driver app with a full-screen job alert (FCM). Retry once on a
    // transient failure; never re-send on success to avoid duplicate alerts.
    try {
      const firstResult = await notifyDriverNewJob(
        driverId,
        booking.refNumber,
        booking.addressLine,
        driverPayment,
        booking.id,
      );
      if (!firstResult) {
        console.error(
          `[mobile-assign] driver push first attempt failed driverId=${driverId} ref=${booking.refNumber}`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        const retryResult = await notifyDriverNewJob(
          driverId,
          booking.refNumber,
          booking.addressLine,
          driverPayment,
          booking.id,
        );
        console.warn(
          `[mobile-assign] driver push retry driverId=${driverId} ref=${booking.refNumber} success=${retryResult}`,
        );
      }
    } catch (pushError) {
      console.error('[mobile-assign] Failed to send new-job push to driver:', pushError);
    }

    // Notification emails — outbound customer link must always be production URL.
    const siteUrl = getOutboundUrl();
    const trackingUrl = `${siteUrl}/tracking/${booking.refNumber}`;

    // Resolve the tyre size for the driver job email.
    let tyreSizeDisplay = 'N/A';
    const [bookingTyre] = await db
      .select()
      .from(bookingTyres)
      .where(eq(bookingTyres.bookingId, booking.id))
      .limit(1);
    if (bookingTyre?.tyreId) {
      const [tyre] = await db
        .select()
        .from(tyreProducts)
        .where(eq(tyreProducts.id, bookingTyre.tyreId))
        .limit(1);
      if (tyre) tyreSizeDisplay = tyre.sizeDisplay;
    }

    // Customer email — "driver assigned".
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
      console.error('[mobile-assign] Failed to send driver assigned email to customer:', emailError);
    }

    // Driver email — "job assigned".
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
        console.error('[mobile-assign] Failed to send job assigned email to driver:', emailError);
      }
    }
  } else {
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUserId: user.id,
      actorRole: 'admin',
      note: 'Driver reassigned by mobile admin app',
    });

    // Notify the newly assigned driver of the reassignment (FCM), retry once.
    try {
      const firstResult = await notifyDriverReassignment(
        driverId,
        booking.refNumber,
        booking.addressLine,
        driverPayment,
        booking.id,
      );
      if (!firstResult) {
        console.error(
          `[mobile-assign] driver reassignment push first attempt failed driverId=${driverId} ref=${booking.refNumber}`,
        );
        await new Promise<void>((resolve) => setTimeout(resolve, 1500));
        const retryResult = await notifyDriverReassignment(
          driverId,
          booking.refNumber,
          booking.addressLine,
          driverPayment,
          booking.id,
        );
        console.warn(
          `[mobile-assign] driver reassignment push retry driverId=${driverId} ref=${booking.refNumber} success=${retryResult}`,
        );
      }
    } catch (pushError) {
      console.error('[mobile-assign] Failed to send reassignment push to driver:', pushError);
    }
  }

  return NextResponse.json({ success: true });
}

// DELETE /api/mobile/admin/bookings/[ref]/assign — remove assigned driver
export async function DELETE(request: Request, { params }: Props) {
  const user = await getMobileAdminUser(request);
  if (!user) return unauthorizedResponse();

  const { ref } = await params;

  const [booking] = await db.select().from(bookings).where(eq(bookings.refNumber, ref)).limit(1);
  if (!booking) {
    return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
  }
  if (!booking.driverId) {
    return NextResponse.json({ error: 'No driver assigned' }, { status: 400 });
  }
  if (['en_route', 'arrived', 'in_progress'].includes(booking.status)) {
    return NextResponse.json(
      { error: `Cannot remove driver while job is ${booking.status}` },
      { status: 400 },
    );
  }

  await db
    .update(bookings)
    .set({
      driverId: null,
      assignedAt: null,
      acceptedAt: null,
      acceptanceDeadline: null,
      status: 'paid',
      updatedAt: new Date(),
    })
    .where(eq(bookings.id, booking.id));

  await db.insert(bookingStatusHistory).values({
    bookingId: booking.id,
    fromStatus: booking.status,
    toStatus: 'paid',
    actorUserId: user.id,
    actorRole: 'admin',
    note: 'Driver removed by mobile admin app',
  });

  return NextResponse.json({ success: true });
}
