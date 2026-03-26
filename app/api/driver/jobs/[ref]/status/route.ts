import { NextResponse } from 'next/server';
import { requireDriverMobile } from '@/lib/auth';
import { db, drivers, bookings, bookingStatusHistory } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { BookingStatus } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { jobComplete } from '@/lib/email/templates';
import { createAdminNotification } from '@/lib/notifications';
import { sendDriverPushNotification } from '@/lib/notifications/driver-push';

interface Props {
  params: Promise<{ ref: string }>;
}

// Valid driver transitions for each status
const DRIVER_TRANSITIONS: Record<string, string> = {
  driver_assigned: 'en_route',
  en_route: 'arrived',
  arrived: 'in_progress',
  in_progress: 'completed',
};

export async function PATCH(request: Request, { params }: Props) {
  try {
    const { user, driverId } = await requireDriverMobile(request);
    const { ref } = await params;
    const { status: newStatus } = await request.json();

    const driver = { id: driverId };

    if (!driver) {
      return NextResponse.json(
        { error: 'Driver record not found' },
        { status: 404 }
      );
    }

    // Get booking - must belong to this driver
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

    if (booking.driverId !== driver.id) {
      return NextResponse.json(
        { error: 'This job is not assigned to you' },
        { status: 403 }
      );
    }

    const currentStatus = booking.status as BookingStatus;

    // Validate the transition
    const expectedNextStatus = DRIVER_TRANSITIONS[currentStatus];
    if (!expectedNextStatus) {
      return NextResponse.json(
        { error: `Cannot update status from ${currentStatus}` },
        { status: 400 }
      );
    }

    if (newStatus !== expectedNextStatus) {
      return NextResponse.json(
        { error: `Invalid status transition. Expected ${expectedNextStatus}, got ${newStatus}` },
        { status: 400 }
      );
    }

    // Perform the transition
    const now = new Date();
    const timestampField: Record<string, string> = {
      en_route: 'enRouteAt',
      arrived: 'arrivedAt',
      in_progress: 'inProgressAt',
      completed: 'completedAt',
    };
    const tsCol = timestampField[newStatus];

    await db
      .update(bookings)
      .set({
        status: newStatus,
        updatedAt: now,
        ...(tsCol ? { [tsCol]: now } : {}),
      })
      .where(eq(bookings.id, booking.id));

    // Log the transition
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: newStatus,
      actorUserId: user.id,
      actorRole: 'driver',
    });

    // Notify admin of status change
    createAdminNotification({
      type: 'booking.updated',
      title: `Booking ${newStatus.replace('_', ' ')}`,
      body: `Booking ${booking.refNumber} — driver status: ${newStatus}`,
      entityType: 'booking',
      entityId: booking.id,
      link: `/admin/bookings/${booking.refNumber}`,
      severity: newStatus === 'completed' ? 'success' : 'info',
      metadata: {
        refNumber: booking.refNumber,
        bookingType: booking.bookingType,
        serviceType: booking.serviceType,
        scheduledAt: booking.scheduledAt ? booking.scheduledAt.toISOString() : null,
        customerName: booking.customerName,
        customerPhone: booking.customerPhone,
        statusFrom: currentStatus,
        statusTo: newStatus,
        updateType: 'driver_progress',
        important: true,
        adminPath: `/admin/bookings/${booking.refNumber}`,
      },
    }).catch(console.error);

    // Persist to driver notification inbox
    const STATUS_LABELS: Record<string, string> = {
      en_route: 'You are en route',
      arrived: 'You have arrived',
      in_progress: 'Work in progress',
      completed: 'Job completed',
    };
    sendDriverPushNotification(
      driver.id,
      STATUS_LABELS[newStatus] || `Status: ${newStatus}`,
      `Job ${booking.refNumber} — ${newStatus.replace(/_/g, ' ')}`,
      { type: 'status_update', ref: booking.refNumber },
      'jobs',
    ).catch(console.error);

    // If marking complete, update driver status to available
    if (newStatus === 'completed') {
      await db
        .update(drivers)
        .set({
          status: 'available',
        })
        .where(eq(drivers.id, driver.id));

      // Send job complete email to customer
      try {
        const siteUrl = process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
        const reviewUrl = `${siteUrl}/review/${booking.refNumber}`;

        const completeEmail = jobComplete({
          customerName: booking.customerName,
          refNumber: booking.refNumber,
          reviewUrl,
        });

        await createNotificationAndSend({
          to: booking.customerEmail,
          subject: completeEmail.subject,
          html: completeEmail.html,
          type: 'job-complete',
          userId: booking.userId,
          bookingId: booking.id,
        });
      } catch (emailError) {
        console.error('Failed to send job complete email:', emailError);
      }
    }

    return NextResponse.json({
      success: true,
      previousStatus: currentStatus,
      newStatus,
    });
  } catch (error) {
    console.error('Error updating job status:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Driver access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update job status' },
      { status: 500 }
    );
  }
}
