import { describe, expect, it } from 'vitest';
import {
  buildBookingTimeline,
  classifyBookingAuditAction,
  deriveBookingInformation,
  formatBookingAuditActor,
  type BookingAuditRow,
} from '../bookings/booking-audit';

const adminA = '11111111-1111-4111-8111-111111111111';
const adminB = '22222222-2222-4222-8222-222222222222';

function row(overrides: Partial<BookingAuditRow>): BookingAuditRow {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    fromStatus: overrides.fromStatus ?? 'awaiting_payment',
    toStatus: overrides.toStatus ?? 'awaiting_payment',
    actorUserId: overrides.actorUserId ?? adminA,
    actorRole: overrides.actorRole ?? 'admin',
    actorName: overrides.actorName ?? 'Admin A',
    actorEmail: overrides.actorEmail ?? null,
    note: overrides.note ?? null,
    createdAt: overrides.createdAt ?? '2026-07-20T09:00:00.000Z',
  };
}

describe('booking audit timeline', () => {
  it('keeps the original creator when another admin edits, dispatches, receives payment, and completes', () => {
    const timeline = buildBookingTimeline([
      row({
        id: 'completed',
        fromStatus: 'in_progress',
        toStatus: 'completed',
        actorUserId: adminB,
        actorName: 'Admin B',
        note: 'Status changed by mobile admin app',
        createdAt: '2026-07-20T13:00:00.000Z',
      }),
      row({
        id: 'payment',
        actorUserId: adminB,
        actorName: 'Admin B',
        note: 'Stripe payment checked manually: Stripe checkout session is paid.',
        createdAt: '2026-07-20T12:00:00.000Z',
      }),
      row({
        id: 'dispatch',
        fromStatus: 'paid',
        toStatus: 'driver_assigned',
        actorUserId: adminB,
        actorName: 'Admin B',
        note: 'Driver assigned by admin',
        createdAt: '2026-07-20T11:00:00.000Z',
      }),
      row({
        id: 'edit',
        actorUserId: adminB,
        actorName: 'Admin B',
        note: 'Booking edited: customerPhone',
        createdAt: '2026-07-20T10:00:00.000Z',
      }),
      row({
        id: 'created',
        fromStatus: null,
        toStatus: 'awaiting_payment',
        actorUserId: adminA,
        actorName: 'Admin A',
        note: 'Quick booking finalized',
        createdAt: '2026-07-20T09:00:00.000Z',
      }),
    ]);

    const info = deriveBookingInformation({
      timeline,
      bookingCreatedAt: '2026-07-20T09:00:00.000Z',
      bookingUpdatedAt: '2026-07-20T13:00:00.000Z',
    });

    expect(info.createdBy).toBe('Admin A');
    expect(info.createdByUserId).toBe(adminA);
    expect(info.createdAt).toBe('2026-07-20T09:00:00.000Z');
    expect(info.lastUpdatedBy).toBe('Admin B');
    expect(info.lastUpdatedByUserId).toBe(adminB);
    expect(info.lastUpdatedAt).toBe('2026-07-20T13:00:00.000Z');
    expect(timeline.map((entry) => entry.action)).toEqual([
      'Booking completed',
      'Payment received',
      'Driver changed',
      'Customer updated',
      'Booking created',
    ]);
  });

  it('classifies important booking edit categories', () => {
    expect(classifyBookingAuditAction(row({ note: 'Booking edited: customerName, customerEmail' }))).toBe('Customer updated');
    expect(classifyBookingAuditAction(row({ note: 'Booking edited: addressLine, scheduledAt' }))).toBe('Location changed');
    expect(classifyBookingAuditAction(row({ note: 'Booking edited: tyreSizeDisplay, quantity' }))).toBe('Tyres changed');
    expect(classifyBookingAuditAction(row({ note: 'Booking edited: totalAmount, priceSnapshot' }))).toBe('Price recalculated');
    expect(classifyBookingAuditAction(row({ note: 'Full outstanding payment link created (£120.00)' }))).toBe('Payment requested');
    expect(classifyBookingAuditAction(row({ note: 'Invoice downloaded (INV-2026-0001)' }))).toBe('Invoice downloaded');
  });

  it('formats admin fallback names from the existing UUID user id when no name is available', () => {
    expect(formatBookingAuditActor({
      actorUserId: adminA,
      actorRole: 'admin',
      actorName: null,
      actorEmail: null,
    })).toBe('Admin #11111111');
  });
});
