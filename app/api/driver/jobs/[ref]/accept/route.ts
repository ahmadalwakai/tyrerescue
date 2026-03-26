import { NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, bookings, bookingStatusHistory } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createAdminNotification } from '@/lib/notifications';
import { sendDriverPushNotification } from '@/lib/notifications/driver-push';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { user, driverId } = await requireDriverMobile(request);
    const { ref } = await params;
    const { action } = await request.json();

    if (!['accept', 'reject'].includes(action)) {
      return NextResponse.json({ error: 'Action must be accept or reject' }, { status: 400 });
    }

    const driver = { id: driverId };

    if (!driver) {
      return NextResponse.json({ error: 'Driver record not found' }, { status: 404 });
    }

    // Get booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    if (booking.driverId !== driver.id) {
      return NextResponse.json({ error: 'This job is not assigned to you' }, { status: 403 });
    }

    if (booking.status !== 'driver_assigned') {
      return NextResponse.json({ error: 'Job can only be accepted/rejected while in driver_assigned status' }, { status: 400 });
    }

    if (action === 'accept') {
      const now = new Date();
      await db
        .update(bookings)
        .set({ acceptedAt: now, updatedAt: now })
        .where(eq(bookings.id, booking.id));

      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: 'driver_assigned',
        toStatus: 'driver_assigned',
        actorUserId: user.id,
        actorRole: 'driver',
        note: 'Driver accepted the job',
      });

      // Notify admin
      createAdminNotification({
        type: 'booking.updated',
        title: 'Driver Accepted Job',
        body: `Booking ${booking.refNumber} accepted by driver`,
        entityType: 'booking',
        entityId: booking.id,
        link: `/admin/bookings/${booking.refNumber}`,
        severity: 'info',
        metadata: {
          refNumber: booking.refNumber,
          bookingType: booking.bookingType,
          serviceType: booking.serviceType,
          scheduledAt: booking.scheduledAt ? booking.scheduledAt.toISOString() : null,
          customerName: booking.customerName,
          customerPhone: booking.customerPhone,
          statusFrom: 'driver_assigned',
          statusTo: 'driver_assigned',
          updateType: 'driver_acceptance',
          important: true,
          adminPath: `/admin/bookings/${booking.refNumber}`,
        },
      }).catch(console.error);

      // Persist to driver notification inbox
      sendDriverPushNotification(
        driver.id,
        'Job Accepted',
        `You accepted job ${booking.refNumber}`,
        { type: 'status_update', ref: booking.refNumber },
        'jobs',
      ).catch(console.error);

      return NextResponse.json({ success: true, action: 'accepted' });
    }

    // Reject — unassign driver, revert to paid
    const now = new Date();
    await db
      .update(bookings)
      .set({
        status: 'paid',
        driverId: null,
        assignedAt: null,
        acceptedAt: null,
        acceptanceDeadline: null,
        updatedAt: now,
      })
      .where(eq(bookings.id, booking.id));

    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: 'driver_assigned',
      toStatus: 'paid',
      actorUserId: user.id,
      actorRole: 'driver',
      note: 'Driver rejected the job',
    });

    // Notify admin of rejection
    createAdminNotification({
      type: 'booking.updated',
      title: 'Driver Rejected Job',
      body: `Booking ${booking.refNumber} rejected by driver — reverted to paid`,
      entityType: 'booking',
      entityId: booking.id,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: 'warning',
      metadata: {
        refNumber: booking.refNumber,
        bookingType: booking.bookingType,
        serviceType: booking.serviceType,
        scheduledAt: booking.scheduledAt ? booking.scheduledAt.toISOString() : null,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        statusFrom: 'driver_assigned',
        statusTo: 'paid',
        updateType: 'driver_assignment',
        important: true,
        adminPath: `/admin/bookings/${booking.refNumber}`,
      },
    }).catch(console.error);

    return NextResponse.json({ success: true, action: 'rejected' });
  } catch (error) {
    console.error('Error accepting/rejecting job:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json({ error: 'Driver access required' }, { status: 403 });
    }
    return NextResponse.json({ error: 'Failed to process action' }, { status: 500 });
  }
}
