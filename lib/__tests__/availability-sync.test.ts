import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  availabilitySlots: {},
  bookings: {},
}));

describe('availability sync candidate generation', () => {
  it('marks pre-10am slots as unavailable for public booking', async () => {
    const { isPublicBookingScheduleSlot } = await import('../availability');

    expect(isPublicBookingScheduleSlot({ timeStart: '09:00' })).toBe(false);
    expect(isPublicBookingScheduleSlot({ timeStart: '10:00' })).toBe(true);
  });

  it('generates same-day future slots plus the next days', async () => {
    const { buildAvailabilitySlotCandidates } = await import('../availability-sync');

    const slots = buildAvailabilitySlotCandidates({
      daysAhead: 2,
      slotMinutes: 60,
      timezone: 'Europe/London',
      now: new Date('2026-06-06T11:30:00Z'),
    });

    expect(slots).toHaveLength(21);
    expect(slots[0]).toEqual({
      date: '2026-06-06',
      timeStart: '13:00',
      timeEnd: '14:00',
    });
    expect(slots[4]).toEqual({
      date: '2026-06-06',
      timeStart: '17:00',
      timeEnd: '18:00',
    });
    expect(slots[5]).toEqual({
      date: '2026-06-07',
      timeStart: '10:00',
      timeEnd: '11:00',
    });
    expect(slots[13]).toEqual({
      date: '2026-06-08',
      timeStart: '10:00',
      timeEnd: '11:00',
    });
  });
});
