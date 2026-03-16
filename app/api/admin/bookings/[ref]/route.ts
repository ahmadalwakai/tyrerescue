import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { db, bookings, bookingStatusHistory } from '@/lib/db';
import { eq } from 'drizzle-orm';
import { executeTransition, BookingStatus, getValidNextStates, isValidTransition } from '@/lib/state-machine';
import { createNotificationAndSend } from '@/lib/email/resend';
import { bookingCancelled } from '@/lib/email/templates/booking-cancelled';

interface Props {
  params: Promise<{ ref: string }>;
}

// PUT /api/admin/bookings/[ref] — edit booking fields
export async function PUT(request: NextRequest, { params }: Props) {
  try {
    const session = await requireAdmin();
    const { ref } = await params;
    const body = await request.json();

    // Fetch booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    // Build update object from allowed fields
    const updates: Record<string, unknown> = {};

    // Customer details
    if (body.customerName !== undefined) {
      const name = String(body.customerName).trim();
      if (name.length < 2) return NextResponse.json({ error: 'Customer name too short' }, { status: 400 });
      updates.customerName = name;
    }
    if (body.customerEmail !== undefined) {
      const email = String(body.customerEmail).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: 'Invalid email address' }, { status: 400 });
      }
      updates.customerEmail = email;
    }
    if (body.customerPhone !== undefined) {
      const phone = String(body.customerPhone).trim();
      if (phone.length < 5) return NextResponse.json({ error: 'Invalid phone number' }, { status: 400 });
      updates.customerPhone = phone;
    }

    // Vehicle details
    if (body.vehicleReg !== undefined) updates.vehicleReg = body.vehicleReg ? String(body.vehicleReg).trim().toUpperCase() : null;
    if (body.vehicleMake !== undefined) updates.vehicleMake = body.vehicleMake ? String(body.vehicleMake).trim() : null;
    if (body.vehicleModel !== undefined) updates.vehicleModel = body.vehicleModel ? String(body.vehicleModel).trim() : null;

    // Address
    if (body.addressLine !== undefined) {
      const addr = String(body.addressLine).trim();
      if (addr.length < 5) return NextResponse.json({ error: 'Address too short' }, { status: 400 });
      updates.addressLine = addr;
    }

    // Schedule
    if (body.scheduledAt !== undefined) {
      updates.scheduledAt = body.scheduledAt ? new Date(body.scheduledAt) : null;
    }

    // Notes
    if (body.notes !== undefined) {
      updates.notes = body.notes ? String(body.notes).trim() : null;
    }

    // Service type
    if (body.serviceType !== undefined) {
      const validServices = ['tyre_replacement', 'puncture_repair', 'locking_nut_removal'];
      if (!validServices.includes(body.serviceType)) {
        return NextResponse.json({ error: 'Invalid service type' }, { status: 400 });
      }
      updates.serviceType = body.serviceType;
    }

    // Booking type
    if (body.bookingType !== undefined) {
      const validTypes = ['emergency', 'scheduled'];
      if (!validTypes.includes(body.bookingType)) {
        return NextResponse.json({ error: 'Invalid booking type' }, { status: 400 });
      }
      updates.bookingType = body.bookingType;
    }

    // Tyre details
    if (body.tyreSizeDisplay !== undefined) {
      updates.tyreSizeDisplay = body.tyreSizeDisplay ? String(body.tyreSizeDisplay).trim() : null;
    }
    if (body.quantity !== undefined) {
      const qty = parseInt(body.quantity, 10);
      if (isNaN(qty) || qty < 1 || qty > 20) {
        return NextResponse.json({ error: 'Quantity must be between 1 and 20' }, { status: 400 });
      }
      updates.quantity = qty;
    }
    if (body.lockingNutStatus !== undefined) {
      const validLock = ['standard', 'has_key', 'no_key'];
      if (body.lockingNutStatus && !validLock.includes(body.lockingNutStatus)) {
        return NextResponse.json({ error: 'Invalid locking nut status' }, { status: 400 });
      }
      updates.lockingNutStatus = body.lockingNutStatus || null;
    }

    // Pricing (admin override)
    if (body.subtotal !== undefined) {
      const sub = parseFloat(body.subtotal);
      if (isNaN(sub) || sub < 0) return NextResponse.json({ error: 'Invalid subtotal' }, { status: 400 });
      updates.subtotal = sub.toFixed(2);
    }
    if (body.vatAmount !== undefined) {
      const vat = parseFloat(body.vatAmount);
      if (isNaN(vat) || vat < 0) return NextResponse.json({ error: 'Invalid VAT amount' }, { status: 400 });
      updates.vatAmount = vat.toFixed(2);
    }
    if (body.totalAmount !== undefined) {
      const total = parseFloat(body.totalAmount);
      if (isNaN(total) || total < 0) return NextResponse.json({ error: 'Invalid total amount' }, { status: 400 });
      updates.totalAmount = total.toFixed(2);
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No fields to update' }, { status: 400 });
    }

    updates.updatedAt = new Date();

    await db.update(bookings).set(updates).where(eq(bookings.id, booking.id));

    // Log the edit in status history as a note
    const editedFields = Object.keys(updates).filter((k) => k !== 'updatedAt').join(', ');
    await db.insert(bookingStatusHistory).values({
      bookingId: booking.id,
      fromStatus: booking.status,
      toStatus: booking.status,
      actorUserId: session.user.id,
      actorRole: 'admin',
      note: `Booking edited: ${editedFields}`,
    });

    return NextResponse.json({ success: true, updatedFields: editedFields });
  } catch (error) {
    console.error('Admin booking update error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PATCH /api/admin/bookings/[ref] — change booking status (admin override)
export async function PATCH(request: NextRequest, { params }: Props) {
  try {
    const session = await requireAdmin();
    const { ref } = await params;
    const body = await request.json();
    const { status: newStatus, note } = body;

    if (!newStatus) {
      return NextResponse.json({ error: 'Status is required' }, { status: 400 });
    }

    // Fetch booking
    const [booking] = await db
      .select()
      .from(bookings)
      .where(eq(bookings.refNumber, ref))
      .limit(1);

    if (!booking) {
      return NextResponse.json({ error: 'Booking not found' }, { status: 404 });
    }

    const currentStatus = booking.status as BookingStatus;

    // Admin can force transitions that are normally valid
    // Plus admin can cancel from most statuses and advance through workflow
    const adminAllowed = [
      ...getValidNextStates(currentStatus),
      // Admin can cancel from any non-terminal status
      ...(
        !['completed', 'cancelled', 'refunded', 'refunded_partial', 'cancelled_refund_pending'].includes(currentStatus)
          ? ['cancelled' as BookingStatus]
          : []
      ),
    ];

    if (!adminAllowed.includes(newStatus as BookingStatus)) {
      return NextResponse.json(
        {
          error: `Cannot transition from '${currentStatus}' to '${newStatus}'`,
          validTransitions: adminAllowed,
        },
        { status: 400 },
      );
    }

    // Use state machine for normal transitions, manual for admin overrides
    if (isValidTransition(currentStatus, newStatus as BookingStatus)) {
      const result = await executeTransition(
        booking.id,
        newStatus as BookingStatus,
        { userId: session.user.id, role: 'admin' },
        note || `Status changed by admin`,
      );
      if (!result.success) {
        return NextResponse.json({ error: result.error }, { status: 400 });
      }
    } else {
      // Admin override (e.g., direct cancel)
      await db.update(bookings).set({ status: newStatus, updatedAt: new Date() }).where(eq(bookings.id, booking.id));
      await db.insert(bookingStatusHistory).values({
        bookingId: booking.id,
        fromStatus: currentStatus,
        toStatus: newStatus,
        actorUserId: session.user.id,
        actorRole: 'admin',
        note: note || `Admin override: status changed`,
      });
    }

    // Send cancellation email to customer
    if (newStatus === 'cancelled' && booking.customerEmail) {
      try {
        const { subject, html } = bookingCancelled({
          customerName: booking.customerName ?? 'Customer',
          refNumber: booking.refNumber,
          reason: note || undefined,
          serviceType: booking.serviceType ?? 'tyre_replacement',
          scheduledAt: booking.scheduledAt ? booking.scheduledAt.toISOString() : null,
        });
        await createNotificationAndSend({
          userId: booking.userId ?? undefined,
          bookingId: booking.id,
          type: 'booking_cancelled',
          to: booking.customerEmail,
          subject,
          html,
        });
      } catch (emailErr) {
        console.error('Failed to send cancellation email:', emailErr);
      }
    }

    return NextResponse.json({ success: true, previousStatus: currentStatus, newStatus });
  } catch (error) {
    console.error('Admin booking status change error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
