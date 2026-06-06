import { describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/db', () => ({ db: {} }));
vi.mock('@/lib/db/schema', () => ({
  availabilitySlots: {},
  bookings: {},
}));

describe('availability sync candidate generation', () => {
  it('generates same-day future slots plus the next days', async () => {
    const { buildAvailabilitySlotCandidates } = await import('../availability-sync');

    const slots = buildAvailabilitySlotCandidates({
      daysAhead: 2,
      slotMinutes: 60,
      timezone: 'Europe/London',
      now: new Date('2026-06-06T11:30:00Z'),
    });

    expect(slots).toHaveLength(23);
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
      timeStart: '09:00',
      timeEnd: '10:00',
    });
    expect(slots[14]).toEqual({
      date: '2026-06-08',
      timeStart: '09:00',
      timeEnd: '10:00',
    });
  });
});
