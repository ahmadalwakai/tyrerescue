import { SignJWT, jwtVerify } from 'jose';
import { z } from 'zod';

const PURPOSE = 'customer_tyre_size_assistance';
const AUDIENCE = 'customer-assisted-help';
const LIFETIME = 30 * 24 * 60 * 60;
export const ASSISTED_HELP_MARKER = 'Tyre size assistance request';
export const assistedHelpIdSchema = z.string().uuid();
export const assistedHelpInputSchema = z.object({
  requestId: assistedHelpIdSchema,
  name: z.string().trim().min(1).max(80),
  phone: z.string().trim().regex(/^(?:\+44|0)[0-9]{9,14}$/),
  address: z.string().trim().min(1).max(500),
  lat: z.number().finite().min(-90).max(90),
  lng: z.number().finite().min(-180).max(180),
  vehicleReg: z.string().trim().max(20).default(''),
  vehicleMake: z.string().trim().max(80).default(''),
  vehicleModel: z.string().trim().max(80).default(''),
  photoUrl: z.string().url().max(2000).refine((value) => value.startsWith('https://'), 'Use a secure photo URL.').optional(),
  contactConsent: z.literal(true),
}).refine((value) => Boolean(value.vehicleReg || value.photoUrl), 'Add your registration or a tyre photo.');

function signingKey() {
  const secret = process.env.CUSTOMER_BOOKING_ACCESS_SECRET ?? process.env.NEXTAUTH_SECRET ?? process.env.AUTH_SECRET;
  if (!secret || secret.length < 32) throw new Error('Assistance access signing is not configured');
  return new TextEncoder().encode(secret);
}

export async function signAssistedHelpAccess(requestId: string) {
  return new SignJWT({ purpose: PURPOSE }).setProtectedHeader({ alg: 'HS256', typ: 'JWT' })
    .setIssuer('tyrerescue').setAudience(AUDIENCE).setSubject(requestId).setIssuedAt()
    .setExpirationTime(`${LIFETIME}s`).sign(signingKey());
}

export async function verifyAssistedHelpAccess(token: string, requestId: string) {
  if (!token || token.length > 4096) return false;
  try {
    const { payload } = await jwtVerify(token, signingKey(), { algorithms: ['HS256'], issuer: 'tyrerescue', audience: AUDIENCE });
    return payload.purpose === PURPOSE && payload.sub === requestId
      && typeof payload.iat === 'number' && typeof payload.exp === 'number'
      && payload.exp > payload.iat && payload.exp - payload.iat <= LIFETIME;
  } catch { return false; }
}

export function assistedHelpReference(requestId: string) { return `HELP-${requestId.toUpperCase()}`; }

export function assistedHelpNotes(input: z.infer<typeof assistedHelpInputSchema>) {
  return [ASSISTED_HELP_MARKER, `Reference: ${assistedHelpReference(input.requestId)}`,
    `Vehicle: ${[input.vehicleReg, input.vehicleMake, input.vehicleModel].filter(Boolean).join(' ') || 'See photo'}`,
    `Location: ${input.address}`, `Map pin: ${input.lat}, ${input.lng}`,
    input.photoUrl ? `Tyre photo: ${input.photoUrl}` : null,
    'Customer requested contact about identifying the tyre size and agreed to share these details with the team.',
    'Confirm tyre size, availability and price with the customer before a separate booking and payment. This is a help request, not a confirmed visit.',
  ].filter(Boolean).join('\n');
}

export function assistedHelpStatus(row: { id: string; status: string; createdAt: Date | null; resolvedAt: Date | null }) {
  return { requestId: row.id, reference: assistedHelpReference(row.id),
    status: row.status === 'resolved' ? 'reviewed' : row.status === 'dismissed' ? 'closed' : 'pending',
    createdAt: row.createdAt?.toISOString() ?? null, reviewedAt: row.resolvedAt?.toISOString() ?? null,
    requiresTeamConfirmation: true, paymentRequired: false };
}
