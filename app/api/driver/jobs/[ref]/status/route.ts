import { NextResponse } from 'next/server';
import { requireDriver } from '@/lib/auth';
import { db, drivers, bookings, bookingStatusHistory } from '@/lib/db';
import { eq, and } from 'drizzle-orm';
import { BookingStatus } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { jobComplete } from '@/lib/email/templates';

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
    const session = await requireDriver();
    const { ref } = await params;
    const { status: newStatus } = await request.json();

    // Get driver record
    const [driver] = await db
      .select({ id: drivers.id })
      .from(drivers)
      .where(eq(drivers.userId, session.user.id))
      .limit(1);

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
    await db
      .update(bookings)
      .set({
        status: newStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    // Log the transition
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: newStatus,
      actorUserId: session.user.id,
      actorRole: 'driver',
    });

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
        const baseUrl = process.env.NEXTAUTH_URL || 'https://tyrerescue.uk';
        const reviewUrl = `${baseUrl}/review/${booking.refNumber}`;

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
