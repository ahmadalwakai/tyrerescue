-- Returning-customer lookups (lib/customers/returning-customer.ts). The
-- expressions must stay identical to the ones in the matching query so the
-- planner uses these indexes. Additive and re-runnable.
CREATE INDEX IF NOT EXISTS bookings_customer_phone_digits_idx
  ON bookings ((regexp_replace(COALESCE(customer_phone, ''), '\D', '', 'g')));
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS bookings_customer_address_norm_idx
  ON bookings ((regexp_replace(trim(regexp_replace(lower(COALESCE(address_line, '')), '[^a-z0-9]+', ' ', 'g')), ' (united kingdom|uk)$', '')));
