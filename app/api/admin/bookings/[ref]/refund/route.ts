import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, refunds, bookingStatusHistory, payments } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { createRefund } from '@/lib/stripe';
import { executeTransition, BookingStatus } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { refundIssued } from '@/lib/email/templates';
import { restoreBookingStock } from '@/lib/inventory/stock-service';
import { createAdminNotification } from '@/lib/notifications';

interface Props {
  params: Promise<{ ref: string }>;
}

export async function POST(request: Request, { params }: Props) {
  try {
    const session = await requireAdmin();
    const { ref } = await params;
    const { reason } = await request.json();

    if (!reason || typeof reason !== 'string' || reason.trim().length === 0) {
      return NextResponse.json(
        { error: 'Refund reason is required' },
        { status: 400 }
      );
    }

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

    // Check if booking has a stripe payment intent
    if (!booking.stripePiId) {
      return NextResponse.json(
        { error: 'No payment found for this booking' },
        { status: 400 }
      );
    }

    const currentStatus = booking.status as BookingStatus;

    // Allow refund from paid, driver_assigned, or completed statuses
    const refundableStatuses = ['paid', 'driver_assigned', 'completed'];
    if (!refundableStatuses.includes(currentStatus)) {
      return NextResponse.json(
        { error: `Cannot refund booking in status: ${currentStatus}` },
        { status: 400 }
      );
    }

    // First transition to cancelled_refund_pending if coming from paid/driver_assigned
    // Or handle completed refunds differently
    let targetStatus: BookingStatus;
    
    if (currentStatus === 'completed') {
      // For completed bookings, we might allow partial refunds
      // For now, we'll just refund and mark as refunded_partial
      targetStatus = 'refunded_partial';
    } else {
      targetStatus = 'cancelled_refund_pending';
    }

    // Transition to pending refund state first
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: currentStatus,
      toStatus: targetStatus,
      actorUserId: session.user.id,
      actorRole: 'admin',
      note: `Refund initiated: ${reason}`,
    });

    await db
      .update(bookings)
      .set({
        status: targetStatus,
        updatedAt: new Date(),
      })
      .where(eq(bookings.id, booking.id));

    // Process the refund through Stripe
    try {
      const stripeRefund = await createRefund(
        booking.stripePiId,
        undefined, // Full refund
        reason
      );

      // Record the refund in our database
      await db.insert(refunds).values({
        bookingId: booking.id,
        stripeRefundId: stripeRefund.id,
        amount: booking.totalAmount.toString(),
        reason: reason.trim(),
        issuedBy: session.user.id,
      });

      // Update to final refunded status
      const finalStatus: BookingStatus = currentStatus === 'completed' 
        ? 'refunded_partial' 
        : 'refunded';

      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: targetStatus,
        toStatus: finalStatus,
        actorUserId: session.user.id,
        actorRole: 'admin',
        note: `Refund completed: ${stripeRefund.id}`,
      });

      await db
        .update(bookings)
        .set({
          status: finalStatus,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));

      // Restore stock for refunded booking
      const stockResult = await restoreBookingStock({
        bookingId: booking.id,
        reason: 'refund',
        actor: 'admin',
        actorUserId: session.user.id,
        note: `Refund ${stripeRefund.id}: stock restored`,
      });
      if (!stockResult.success) {
        console.error('[refund] stock restore failed:', stockResult.error);
      }

      // Admin notification for refund
      await createAdminNotification({
        type: 'booking.updated',
        title: 'Refund Issued',
        body: `£${parseFloat(booking.totalAmount.toString()).toFixed(2)} refunded for ${booking.refNumber}`,
        entityType: 'booking',
        entityId: booking.id,
        link: `/admin/bookings/${booking.refNumber}`,
        severity: 'warning',
      });

      // Send refund email to customer
      try {
        // Try to get last4 from payment
        let last4 = '****';
        const [payment] = await db
          .select()
          .from(payments)
          .where(eq(payments.bookingId, booking.id))
          .limit(1);

        if (payment?.stripePayload) {
          const payload = payment.stripePayload as { 
            charges?: { data?: [{ payment_method_details?: { card?: { last4?: string } } }] } 
          };
          last4 = payload?.charges?.data?.[0]?.payment_method_details?.card?.last4 || '****';
        }

        const refundEmail = refundIssued({
          customerName: booking.customerName,
          amount: parseFloat(booking.totalAmount.toString()),
          refNumber: booking.refNumber,
          last4,
        });

        await createNotificationAndSend({
          to: booking.customerEmail,
          subject: refundEmail.subject,
          html: refundEmail.html,
          type: 'refund-issued',
          userId: booking.userId,
          bookingId: booking.id,
        });
      } catch (emailError) {
        console.error('Failed to send refund email:', emailError);
      }

      return NextResponse.json({
        success: true,
        refundId: stripeRefund.id,
        amount: parseFloat(booking.totalAmount.toString()),
      });
    } catch (stripeError) {
      // If Stripe refund fails, revert the status
      console.error('Stripe refund failed:', stripeError);

      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: targetStatus,
        toStatus: currentStatus,
        actorUserId: session.user.id,
        actorRole: 'admin',
        note: 'Refund failed - status reverted',
      });

      await db
        .update(bookings)
        .set({
          status: currentStatus,
          updatedAt: new Date(),
        })
        .where(eq(bookings.id, booking.id));

      return NextResponse.json(
        { error: 'Failed to process refund with payment provider' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('Error processing refund:', error);
    if (error instanceof Error && error.message.includes('Forbidden')) {
      return NextResponse.json(
        { error: 'Admin access required' },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to process refund' },
      { status: 500 }
    );
  }
}
