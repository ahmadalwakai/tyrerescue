import { createProjectBookingPostHandler } from '../../_project-booking-route';

export const dynamic = 'force-dynamic';

// Alias of /api/integrations/247-mo-glasgow/bookings: same project source,
// no separate '247_mobile_tyres_glasgow' source is configured.
export const POST = createProjectBookingPostHandler('247_mo_glasgow');
