import { z } from 'zod';

export const bookingRequestSchema = z.object({
  service: z.enum(['mobile_fitting', 'puncture_repair', 'emergency_callout', 'locking_wheel_nut']),
  location: z.string().trim().min(3).max(240),
  tyreSize: z.string().trim().max(32).optional(),
  quantity: z.coerce.number().int().min(1).max(8),
  vehicleReg: z.string().trim().max(16).optional(),
  vehicleMake: z.string().trim().max(80).optional(),
  vehicleModel: z.string().trim().max(80).optional(),
  preferredDate: z.string().trim().max(40).optional(),
  preferredTime: z.string().trim().max(40).optional(),
  urgency: z.enum(['asap', 'today', 'scheduled']).default('asap'),
  accessType: z.enum(['driveway', 'street', 'car_park', 'roadside', 'workplace', 'other']).default('street'),
  lockingNutStatus: z.enum(['has_key', 'no_key', 'standard', 'unknown']).default('unknown'),
  parkingNotes: z.string().trim().max(240).optional(),
  customerName: z.string().trim().min(2).max(120),
  customerPhone: z.string().trim().min(8).max(24),
  customerEmail: z.string().trim().email().max(160),
  notes: z.string().trim().max(1000).optional(),
  quoteId: z.string().uuid().optional(),
  gclid: z.string().trim().max(255).optional(),
  utmSource: z.string().trim().max(100).optional(),
  utmMedium: z.string().trim().max(100).optional(),
  utmCampaign: z.string().trim().max(160).optional(),
  utmTerm: z.string().trim().max(160).optional(),
  utmContent: z.string().trim().max(160).optional(),
  landingPage: z.string().trim().max(500).optional(),
  referrer: z.string().trim().max(500).optional(),
});

export type BookingRequest = z.infer<typeof bookingRequestSchema>;

export const quoteRequestSchema = z.object({
  service: z.enum(['mobile_fitting', 'puncture_repair', 'emergency_callout', 'locking_wheel_nut']).default('mobile_fitting'),
  location: z.string().trim().min(3).max(240),
  tyreSize: z.string().trim().max(32).optional(),
  quantity: z.coerce.number().int().min(1).max(8).default(1),
  urgency: z.enum(['asap', 'today', 'scheduled']).default('asap'),
  preferredDate: z.string().trim().max(40).optional(),
  preferredTime: z.string().trim().max(40).optional(),
});

export type QuoteRequest = z.infer<typeof quoteRequestSchema>;
