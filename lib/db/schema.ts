import {
  pgTable,
  pgEnum,
  index,
  uniqueIndex,
  check,
  foreignKey,
  uuid,
  varchar,
  text,
  boolean,
  timestamp,
  decimal,
  integer,
  date,
  time,
  jsonb,
  inet,
  real,
  customType,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; notNull: true; default: false }>({
  dataType() {
    return 'bytea';
  },
});
import { sql } from 'drizzle-orm';
import type { QuoteTyreSelectionSnapshot } from '@/lib/quote-snapshot';
import type {
  AdminQuoteConfirmationMethod,
  AdminQuotePaymentOption,
  AdminQuoteStatus,
} from '@/types/admin-quotes';

export type TyreSeason = 'allseason' | 'summer' | 'winter';

// Users table
export const users = pgTable('users', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  email: varchar('email', { length: 255 }).unique().notNull(),
  passwordHash: varchar('password_hash', { length: 255 }),
  name: varchar('name', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  role: text('role').notNull().default('customer'),
  emailVerified: boolean('email_verified').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Explicitly opted-in Assisted Chat installations. No automatic expiry or idle
// timeout; revocation is scoped to one opaque device credential.
export const adminDeviceSessions = pgTable('admin_device_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 120 }),
  modelName: varchar('model_name', { length: 120 }),
  platform: varchar('platform', { length: 24 }),
  osVersion: varchar('os_version', { length: 64 }),
  appVersion: varchar('app_version', { length: 40 }),
  userAgent: varchar('user_agent', { length: 256 }),
  firstIp: inet('first_ip'),
  lastIp: inet('last_ip'),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  revokedBy: uuid('revoked_by').references(() => users.id, { onDelete: 'set null' }),
}, (table) => [index('admin_device_sessions_user_idx').on(table.userId)]);

// Driver installations explicitly opt in after password authentication. The
// opaque credential has no inactivity/clock expiry; explicit revocation ends it.
export const driverDeviceSessions = pgTable('driver_device_sessions', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: varchar('token_hash', { length: 64 }).notNull().unique(),
  deviceName: varchar('device_name', { length: 120 }),
  modelName: varchar('model_name', { length: 120 }),
  platform: varchar('platform', { length: 24 }),
  osVersion: varchar('os_version', { length: 64 }),
  appVersion: varchar('app_version', { length: 40 }),
  lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
}, (table) => [index('driver_device_sessions_user_idx').on(table.userId)]);

// OAuth accounts table (for Google sign-in etc.)
export const accounts = pgTable('accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  type: varchar('type', { length: 50 }).notNull(),
  provider: varchar('provider', { length: 50 }).notNull(),
  providerAccountId: varchar('provider_account_id', { length: 255 }).notNull(),
  accessToken: text('access_token'),
  refreshToken: text('refresh_token'),
  expiresAt: integer('expires_at'),
  tokenType: varchar('token_type', { length: 50 }),
  scope: text('scope'),
  idToken: text('id_token'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Drivers table
export const drivers = pgTable('drivers', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  isOnline: boolean('is_online').default(false),
  currentLat: decimal('current_lat', { precision: 9, scale: 6 }),
  currentLng: decimal('current_lng', { precision: 9, scale: 6 }),
  locationAt: timestamp('location_at', { withTimezone: true }),
  status: text('status').default('offline'),
  pushToken: text('push_token'),
  pushTokenPlatform: text('push_token_platform'),
  appVersion: text('app_version'),
  locationSource: text('location_source'),  // 'mobile_app' | 'web_portal'
  createdBy: uuid('created_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Tyre catalogue (master readonly list of all known sizes/brands)
export const tyreCatalogue = pgTable('tyre_catalogue', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  brand: varchar('brand', { length: 100 }).notNull(),
  pattern: varchar('pattern', { length: 200 }).notNull(),
  width: integer('width').notNull(),
  aspect: integer('aspect').notNull(),
  rim: integer('rim').notNull(),
  sizeDisplay: varchar('size_display', { length: 20 }).notNull(),
  season: text('season').$type<TyreSeason>().notNull().default('allseason'),
  speedRating: varchar('speed_rating', { length: 5 }),
  loadIndex: integer('load_index'),
  wetGrip: varchar('wet_grip', { length: 2 }),
  fuelEfficiency: varchar('fuel_efficiency', { length: 2 }),
  noiseDb: integer('noise_db'),
  runFlat: boolean('run_flat').default(false),
  tier: text('tier').notNull().default('mid'),
  suggestedPriceNew: decimal('suggested_price_new', { precision: 10, scale: 2 }),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Tyre products table (admin-activated subset with price/stock)
export const tyreProducts = pgTable('tyre_products', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  catalogueId: uuid('catalogue_id').references(() => tyreCatalogue.id, { onDelete: 'cascade' }),
  brand: varchar('brand', { length: 100 }).notNull(),
  pattern: varchar('pattern', { length: 200 }).notNull(),
  width: integer('width').notNull(),
  aspect: integer('aspect').notNull(),
  rim: integer('rim').notNull(),
  sizeDisplay: varchar('size_display', { length: 20 }).notNull(),
  season: text('season').$type<TyreSeason>().notNull(),
  speedRating: varchar('speed_rating', { length: 5 }),
  loadIndex: integer('load_index'),
  wetGrip: varchar('wet_grip', { length: 2 }),
  fuelEfficiency: varchar('fuel_efficiency', { length: 2 }),
  noiseDb: integer('noise_db'),
  runFlat: boolean('run_flat').default(false),
  barcode: varchar('barcode', { length: 50 }),
  priceNew: decimal('price_new', { precision: 10, scale: 2 }),
  stockNew: integer('stock_new').default(0),
  stockOrdered: integer('stock_ordered').default(0),
  isLocalStock: boolean('is_local_stock').default(true),
  availableNew: boolean('available_new').default(true),
  featured: boolean('featured').default(false),
  images: text('images').array(),
  slug: varchar('slug', { length: 255 }).unique().notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// ──────────────────────────────────────────────
// Stock city foundation (city-scoped stock system)
// ──────────────────────────────────────────────

export const stockCityRoleEnum = pgEnum('stock_city_role', [
  'viewer',
  'operator',
  'manager',
]);

export const stockShiftStatusEnum = pgEnum('stock_shift_status', [
  'active',
  'ended',
  'void',
]);

export const stockMovementTypeEnum = pgEnum('stock_movement_type', [
  'RECEIVED',
  'SALE',
  'SALE_REVERSAL',
  'RETURN',
  'DAMAGED',
  'CORRECTION',
]);

export const stockSaleChannelEnum = pgEnum('stock_sale_channel', [
  'GARAGE',
  'EMERGENCY_CALL_OUT',
]);

export const stockCities = pgTable('stock_cities', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  name: varchar('name', { length: 120 }).notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('stock_cities_active_idx').on(table.isActive),
]);

export const stockUserCityAccess = pgTable('stock_user_city_access', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'cascade' }),
  roleInCity: stockCityRoleEnum('role_in_city').notNull().default('operator'),
  isActive: boolean('is_active').notNull().default(true),
  createdByUserId: uuid('created_by_user_id').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('stock_user_city_access_user_city_unique').on(table.userId, table.cityId),
  index('stock_user_city_access_user_idx').on(table.userId),
  index('stock_user_city_access_city_idx').on(table.cityId),
]);

export const stockShifts = pgTable('stock_shifts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'restrict' }),
  startedAt: timestamp('started_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  status: stockShiftStatusEnum('status').notNull().default('active'),
  endedByUserId: uuid('ended_by_user_id').references(() => users.id),
  adminOverrideReason: text('admin_override_reason'),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).unique(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('stock_shifts_one_active_per_user_idx')
    .on(table.userId)
    .where(sql`${table.endedAt} IS NULL`),
  index('stock_shifts_city_started_idx').on(table.cityId, table.startedAt),
  index('stock_shifts_user_started_idx').on(table.userId, table.startedAt),
]);

export const stockInventoryBalances = pgTable('stock_inventory_balances', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'cascade' }),
  tyreProductId: uuid('tyre_product_id').notNull().references(() => tyreProducts.id, { onDelete: 'restrict' }),
  currentStock: integer('current_stock').notNull().default(0),
  reservedStock: integer('reserved_stock').notNull().default(0),
  orderedStock: integer('ordered_stock').notNull().default(0),
  minStock: integer('min_stock').notNull().default(0),
  targetStock: integer('target_stock').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('stock_inventory_balances_city_product_unique').on(table.cityId, table.tyreProductId),
  index('stock_inventory_balances_city_idx').on(table.cityId),
  index('stock_inventory_balances_product_idx').on(table.tyreProductId),
  check('stock_inventory_balances_current_stock_nonnegative', sql`${table.currentStock} >= 0`),
  check('stock_inventory_balances_reserved_stock_nonnegative', sql`${table.reservedStock} >= 0`),
  check('stock_inventory_balances_ordered_stock_nonnegative', sql`${table.orderedStock} >= 0`),
  check('stock_inventory_balances_min_stock_nonnegative', sql`${table.minStock} >= 0`),
  check('stock_inventory_balances_target_stock_nonnegative', sql`${table.targetStock} >= 0`),
]);

// Registration-level tyre fitments confirmed by an admin from the sidewall.
// This is the runtime source of truth; JSON catalogues are read-only seed data.
export const vehicleTyreFitments = pgTable('vehicle_tyre_fitments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  registrationNumber: varchar('registration_number', { length: 16 }).unique().notNull(),
  vehicleFingerprint: varchar('vehicle_fingerprint', { length: 255 }).notNull(),
  vehicleFingerprintPayload: jsonb('vehicle_fingerprint_payload')
    .$type<Record<string, unknown>>()
    .notNull()
    .default(sql`'{}'::jsonb`),
  make: varchar('make', { length: 100 }),
  model: varchar('model', { length: 150 }),
  yearOfManufacture: integer('year_of_manufacture'),
  fuelType: varchar('fuel_type', { length: 30 }),
  colour: varchar('colour', { length: 60 }),
  options: jsonb('options').$type<Array<Record<string, unknown>>>().notNull().default(sql`'[]'::jsonb`),
  source: varchar('source', { length: 80 }).notNull().default('assisted_chat_sidewall'),
  status: varchar('status', { length: 30 }).notNull().default('confirmed'),
  reviewHistory: jsonb('review_history')
    .$type<Array<Record<string, unknown>>>()
    .notNull()
    .default(sql`'[]'::jsonb`),
  confirmedBy: uuid('confirmed_by').references(() => users.id, { onDelete: 'set null' }),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

// Bookings table
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  refNumber: varchar('ref_number', { length: 20 }).unique().notNull(),
  sourceApp: varchar('source_app', { length: 60 }).notNull().default('tyre_rescue'),
  sourceLabel: varchar('source_label', { length: 120 }).notNull().default('Tyre Rescue'),
  externalReference: varchar('external_reference', { length: 120 }),
  userId: uuid('user_id').references(() => users.id),
  driverId: uuid('driver_id').references(() => drivers.id),
  status: text('status').notNull().default('draft'),
  bookingType: text('booking_type').notNull(),
  serviceType: text('service_type').notNull(),
  addressLine: text('address_line').notNull(),
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  distanceMiles: decimal('distance_miles', { precision: 5, scale: 2 }),
  distanceSource: varchar('distance_source', { length: 20 }),
  quantity: integer('quantity').notNull().default(1),
  tyreSizeDisplay: varchar('tyre_size_display', { length: 20 }),
  vehicleReg: varchar('vehicle_reg', { length: 10 }),
  vehicleMake: varchar('vehicle_make', { length: 100 }),
  vehicleModel: varchar('vehicle_model', { length: 100 }),
  tyrePhotoUrl: text('tyre_photo_url'),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  priceSnapshot: jsonb('price_snapshot').notNull(),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  vatAmount: decimal('vat_amount', { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  stripePiId: varchar('stripe_pi_id', { length: 255 }),
  // Deposit payment fields
  paymentType: text('payment_type'), // 'cash' | 'full' | 'deposit'
  depositAmountPence: integer('deposit_amount_pence'),
  depositPaidAt: timestamp('deposit_paid_at', { withTimezone: true }),
  remainingBalancePence: integer('remaining_balance_pence'),
  stripeDepositPiId: varchar('stripe_deposit_pi_id', { length: 255 }),
  quoteExpiresAt: timestamp('quote_expires_at', { withTimezone: true }),
  stockCityId: uuid('stock_city_id').references(() => stockCities.id),
  stockCityLockedAt: timestamp('stock_city_locked_at', { withTimezone: true }),
  lockingNutStatus: text('locking_nut_status'),
  hasPreOrderItems: boolean('has_pre_order_items').default(false),
  fulfillmentOption: text('fulfillment_option'),
  notes: text('notes'),
  // Attribution / UTM tracking
  utmSource: varchar('utm_source', { length: 100 }),
  utmMedium: varchar('utm_medium', { length: 100 }),
  utmCampaign: varchar('utm_campaign', { length: 255 }),
  utmTerm: varchar('utm_term', { length: 255 }),
  utmContent: varchar('utm_content', { length: 255 }),
  gclid: varchar('gclid', { length: 255 }),
  landingPage: varchar('landing_page', { length: 500 }),
  referrer: varchar('referrer', { length: 500 }),
  // Assignment lifecycle timestamps
  assignedAt: timestamp('assigned_at', { withTimezone: true }),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  enRouteAt: timestamp('en_route_at', { withTimezone: true }),
  arrivedAt: timestamp('arrived_at', { withTimezone: true }),
  inProgressAt: timestamp('in_progress_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  acceptanceDeadline: timestamp('acceptance_deadline', { withTimezone: true }),
  wheelNutConsentRequiredAt: timestamp('wheel_nut_consent_required_at', { withTimezone: true }),
  wheelNutConsentRequiredByDriverId: uuid('wheel_nut_consent_required_by_driver_id').references(() => drivers.id),
  wheelNutConsentReason: text('wheel_nut_consent_reason'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Booking tyres junction table
export const bookingTyres = pgTable('booking_tyres', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  tyreId: uuid('tyre_id').references(() => tyreProducts.id),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  service: text('service').notNull(),
});

// Booking status history
export const bookingStatusHistory = pgTable('booking_status_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id),
  fromStatus: text('from_status'),
  toStatus: text('to_status').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorRole: text('actor_role'),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Signed customer consent for locking wheel nut extraction / wheel damage risk.
export const wheelNutConsents = pgTable('wheel_nut_consents', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  bookingRef: varchar('booking_ref', { length: 20 }).notNull(),
  driverId: uuid('driver_id').references(() => drivers.id),
  driverUserId: uuid('driver_user_id').references(() => users.id),
  driverName: varchar('driver_name', { length: 255 }),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  vehicleReg: varchar('vehicle_reg', { length: 16 }),
  declarationText: text('declaration_text').notNull(),
  declarationAccepted: boolean('declaration_accepted').notNull().default(false),
  signatureUrl: text('signature_url').notNull(),
  signatureMimeType: varchar('signature_mime_type', { length: 50 }).notNull().default('image/png'),
  signatureFileSize: integer('signature_file_size'),
  signaturePointCount: integer('signature_point_count'),
  signatureSha256: varchar('signature_sha256', { length: 64 }),
  pdfUrl: text('pdf_url').notNull(),
  pdfFileSize: integer('pdf_file_size'),
  pdfSha256: varchar('pdf_sha256', { length: 64 }),
  gpsLat: decimal('gps_lat', { precision: 9, scale: 6 }),
  gpsLng: decimal('gps_lng', { precision: 9, scale: 6 }),
  gpsAccuracy: real('gps_accuracy'),
  deviceId: text('device_id'),
  deviceLabel: text('device_label'),
  emailStatus: text('email_status').notNull().default('not_sent'),
  emailSentAt: timestamp('email_sent_at', { withTimezone: true }),
  emailError: text('email_error'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

// Inventory reservations
export const inventoryReservations = pgTable('inventory_reservations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tyreId: uuid('tyre_id').references(() => tyreProducts.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  quantity: integer('quantity').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  released: boolean('released').default(false),
});

// Inventory movements
export const inventoryMovements = pgTable('inventory_movements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  tyreId: uuid('tyre_id').references(() => tyreProducts.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  movementType: text('movement_type'),
  quantityDelta: integer('quantity_delta').notNull(),
  stockAfter: integer('stock_after').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  note: text('note'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const stockReservations = pgTable('stock_reservations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'cascade' }),
  tyreProductId: uuid('tyre_product_id').notNull().references(() => tyreProducts.id, { onDelete: 'restrict' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  quantity: integer('quantity').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  released: boolean('released').notNull().default(false),
  releasedAt: timestamp('released_at', { withTimezone: true }),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).unique(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('stock_reservations_city_product_expires_idx').on(table.cityId, table.tyreProductId, table.expiresAt),
  index('stock_reservations_booking_idx').on(table.bookingId),
  check('stock_reservations_quantity_positive', sql`${table.quantity} > 0`),
]);

export const stockMovements = pgTable('stock_movements', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'restrict' }),
  tyreProductId: uuid('tyre_product_id').notNull().references(() => tyreProducts.id, { onDelete: 'restrict' }),
  movementType: stockMovementTypeEnum('movement_type').notNull(),
  quantityDelta: integer('quantity_delta').notNull(),
  previousBalance: integer('previous_balance').notNull(),
  resultingBalance: integer('resulting_balance').notNull(),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  shiftId: uuid('shift_id').references(() => stockShifts.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  saleChannel: stockSaleChannelEnum('sale_channel'),
  reversesMovementId: uuid('reverses_movement_id'),
  idempotencyKey: varchar('idempotency_key', { length: 200 }).unique(),
  reason: text('reason'),
  note: text('note'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  occurredAt: timestamp('occurred_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('stock_movements_reverses_unique_idx')
    .on(table.reversesMovementId)
    .where(sql`${table.reversesMovementId} IS NOT NULL`),
  index('stock_movements_city_product_occurred_idx').on(table.cityId, table.tyreProductId, table.occurredAt),
  index('stock_movements_booking_idx').on(table.bookingId),
  index('stock_movements_shift_idx').on(table.shiftId),
  foreignKey({
    name: 'stock_movements_reverses_movement_id_stock_movements_id_fk',
    columns: [table.reversesMovementId],
    foreignColumns: [table.id],
  }),
  check('stock_movements_quantity_delta_nonzero', sql`${table.quantityDelta} != 0`),
  check('stock_movements_previous_balance_nonnegative', sql`${table.previousBalance} >= 0`),
  check('stock_movements_resulting_balance_nonnegative', sql`${table.resultingBalance} >= 0`),
]);

export const missingTyreRequests = pgTable('missing_tyre_requests', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  cityId: uuid('city_id').notNull().references(() => stockCities.id, { onDelete: 'cascade' }),
  normalizedSize: varchar('normalized_size', { length: 32 }).notNull(),
  requesterUserId: uuid('requester_user_id').references(() => users.id),
  shiftId: uuid('shift_id').references(() => stockShifts.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  saleChannel: stockSaleChannelEnum('sale_channel'),
  context: jsonb('context').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('missing_tyre_requests_city_size_created_idx').on(table.cityId, table.normalizedSize, table.createdAt),
  index('missing_tyre_requests_booking_idx').on(table.bookingId),
  index('missing_tyre_requests_shift_idx').on(table.shiftId),
]);

// Payments
export const payments = pgTable('payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id),
  stripePiId: varchar('stripe_pi_id', { length: 255 }).unique().notNull(),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  currency: varchar('currency', { length: 3 }).default('gbp'),
  status: text('status').notNull(),
  stripePayload: jsonb('stripe_payload'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Canonical payment ledger. This records payment truth and link lifecycle
// without overloading the legacy Stripe-only payments table.
export const paymentEvents = pgTable('payment_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  bookingRef: varchar('booking_ref', { length: 20 }),
  eventType: text('event_type').notNull(),
  paymentMethod: text('payment_method'),
  paidVia: text('paid_via'),
  linkStatus: text('link_status'),
  amountPence: integer('amount_pence'),
  currency: text('currency').default('gbp'),
  stripeSessionId: text('stripe_session_id'),
  stripePaymentIntentId: text('stripe_payment_intent_id'),
  stripeCheckoutUrl: text('stripe_checkout_url'),
  source: text('source').notNull(),
  status: text('status'),
  metadata: jsonb('metadata'),
  occurredAt: timestamp('occurred_at', { withTimezone: true }),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Refunds
export const refunds = pgTable('refunds', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  paymentId: uuid('payment_id').references(() => payments.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  stripeRefundId: varchar('stripe_refund_id', { length: 255 }),
  amount: decimal('amount', { precision: 10, scale: 2 }).notNull(),
  reason: text('reason').notNull(),
  issuedBy: uuid('issued_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Pricing rules
export const pricingRules = pgTable('pricing_rules', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 100 }).unique().notNull(),
  value: text('value').notNull(),
  label: varchar('label', { length: 200 }),
  type: text('type'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Availability slots
export const availabilitySlots = pgTable('availability_slots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  date: date('date').notNull(),
  timeStart: time('time_start').notNull(),
  timeEnd: time('time_end').notNull(),
  maxBookings: integer('max_bookings').default(1),
  bookedCount: integer('booked_count').default(0),
  active: boolean('active').default(true),
});

// Bank holidays
export const bankHolidays = pgTable('bank_holidays', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  date: date('date').unique().notNull(),
  name: varchar('name', { length: 100 }),
  region: varchar('region', { length: 50 }).default('Scotland'),
});

// Service areas
export const serviceAreas = pgTable('service_areas', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }),
  centerLat: decimal('center_lat', { precision: 9, scale: 6 }),
  centerLng: decimal('center_lng', { precision: 9, scale: 6 }),
  radiusMiles: decimal('radius_miles', { precision: 5, scale: 2 }),
  priority: integer('priority').default(0),
  active: boolean('active').default(true),
});

// Audit logs
export const auditLogs = pgTable('audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  actorUserId: uuid('actor_user_id').references(() => users.id),
  actorRole: varchar('actor_role', { length: 20 }),
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  action: varchar('action', { length: 100 }),
  beforeJson: jsonb('before_json'),
  afterJson: jsonb('after_json'),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Notifications
export const notifications = pgTable('notifications', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  type: varchar('type', { length: 50 }).notNull(),
  channel: text('channel').default('email'),
  status: text('status').default('pending'),
  attempts: integer('attempts').default(0),
  lastError: text('last_error'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Testimonials
export const testimonials = pgTable('testimonials', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  authorName: varchar('author_name', { length: 255 }).notNull(),
  rating: integer('rating'),
  content: text('content').notNull(),
  jobType: varchar('job_type', { length: 100 }),
  approved: boolean('approved').default(false),
  featured: boolean('featured').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// FAQs
export const faqs = pgTable('faqs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  question: text('question').notNull(),
  answer: text('answer').notNull(),
  displayOrder: integer('display_order'),
  active: boolean('active').default(true),
});

// Chat sessions
export const chatSessions = pgTable('chat_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id),
  messages: jsonb('messages').notNull().default(sql`'[]'::jsonb`),
  context: jsonb('context'),
  summary: text('summary'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Agent long-term memory (persists across sessions)
export const agentMemory = pgTable('agent_memory', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  kind: text('kind').notNull(), // 'entity_ref' | 'preference' | 'follow_up' | 'fact'
  entityType: varchar('entity_type', { length: 50 }),
  entityId: uuid('entity_id'),
  entityRef: varchar('entity_ref', { length: 50 }),
  content: text('content').notNull(),
  metadata: jsonb('metadata'),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Driver location history
export const driverLocationHistory = pgTable('driver_location_history', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  driverId: uuid('driver_id').references(() => drivers.id),
  bookingId: uuid('booking_id').references(() => bookings.id),
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).default(sql`NOW()`),
});

// Surge pricing log
export const surgePricingLog = pgTable('surge_pricing_log', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id),
  groqInput: jsonb('groq_input'),
  groqOutput: jsonb('groq_output'),
  multiplierUsed: decimal('multiplier_used', { precision: 4, scale: 3 }),
  applied: boolean('applied'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Quotes table (serverless-compatible quote storage)
export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  lat: decimal('lat', { precision: 9, scale: 6 }).notNull(),
  lng: decimal('lng', { precision: 9, scale: 6 }).notNull(),
  addressLine: text('address_line').notNull(),
  bookingType: text('booking_type').notNull(),
  serviceType: text('service_type').notNull(),
  tyreSelections: jsonb('tyre_selections').$type<QuoteTyreSelectionSnapshot[]>().notNull(),
  scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
  distanceMiles: decimal('distance_miles', { precision: 5, scale: 2 }).notNull(),
  breakdown: jsonb('breakdown').notNull(),
  metadata: jsonb('metadata'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Password reset tokens table
export const passwordResetTokens = pgTable('password_reset_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Email verification tokens table
export const emailVerificationTokens = pgTable('email_verification_tokens', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  tokenHash: varchar('token_hash', { length: 255 }).notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  used: boolean('used').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// AI phone receptionist call sessions
export const aiCallSessions = pgTable('ai_call_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  callSid: varchar('call_sid', { length: 64 }).unique().notNull(),
  callerNumber: varchar('caller_number', { length: 20 }).notNull(),
  step: integer('step').notNull().default(0),
  collectedData: jsonb('collected_data').notNull().default(sql`'{}'::jsonb`),
  transcript: jsonb('transcript').notNull().default(sql`'[]'::jsonb`),
  status: text('status').notNull().default('active'),
  callMeBackId: uuid('call_me_back_id'),
  retryCount: integer('retry_count').notNull().default(0),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Call Me Back requests
export const callMeBack = pgTable('call_me_back', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  phone: varchar('phone', { length: 20 }).notNull(),
  notes: text('notes'),
  status: text('status').notNull().default('pending'),
  resolvedAt: timestamp('resolved_at', { withTimezone: true }),
  resolvedBy: uuid('resolved_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Contact messages
export const contactMessages = pgTable('contact_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 100 }).notNull(),
  email: varchar('email', { length: 255 }).notNull(),
  phone: varchar('phone', { length: 20 }),
  message: text('message').notNull(),
  status: text('status').notNull().default('unread'),
  aiPriority: text('ai_priority'),
  aiCategory: text('ai_category'),
  aiSuggestedResponse: text('ai_suggested_response'),
  requiresImmediateCall: boolean('requires_immediate_call').default(false),
  aiSentiment: text('ai_sentiment'),
  repliedAt: timestamp('replied_at', { withTimezone: true }),
  repliedBy: uuid('replied_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// Cookie settings
export const cookieSettings = pgTable('cookie_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 100 }).unique().notNull(),
  value: text('value').notNull(),
  label: varchar('label', { length: 200 }),
  description: text('description'),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Admin chat settings (per-admin chatbot preferences)
export const adminChatSettings = pgTable('admin_chat_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  userId: uuid('user_id').references(() => users.id).unique().notNull(),
  dailyAskEnabled: boolean('daily_ask_enabled').default(true),
  dailyAskTime: text('daily_ask_time'),
  lastAskedAt: timestamp('last_asked_at', { withTimezone: true }),
  lastAnsweredAt: timestamp('last_answered_at', { withTimezone: true }),
  voiceInputEnabled: boolean('voice_input_enabled').default(false),
  voiceOutputEnabled: boolean('voice_output_enabled').default(false),
  autoOpenEnabled: boolean('auto_open_enabled').default(true),
  lastSeenAlertsAt: timestamp('last_seen_alerts_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// ─── Booking Chat System ────────────────────────────────────────────────────

// Booking conversations and private staff-to-driver conversations.
export const bookingConversations = pgTable('booking_conversations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  directDriverId: uuid('direct_driver_id').references(() => drivers.id, { onDelete: 'cascade' }),
  channel: text('channel').notNull(), // customer_admin | customer_driver | admin_driver
  status: text('status').notNull().default('open'), // open | closed | archived
  locked: boolean('locked').default(false),
  muted: boolean('muted').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  uniqueIndex('booking_conversations_direct_driver_unique').on(table.directDriverId).where(sql`${table.directDriverId} IS NOT NULL`),
  check('booking_conversations_scope_check', sql`(${table.bookingId} IS NOT NULL AND ${table.directDriverId} IS NULL) OR (${table.bookingId} IS NULL AND ${table.directDriverId} IS NOT NULL AND ${table.channel} = 'admin_driver')`),
]);

// Conversation participants
export const conversationParticipants = pgTable('conversation_participants', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversation_id').references(() => bookingConversations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  role: text('role').notNull(), // 'customer' | 'admin' | 'driver'
  joinedAt: timestamp('joined_at', { withTimezone: true }).default(sql`NOW()`),
});

// Booking messages
export const bookingMessages = pgTable('booking_messages', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversation_id').references(() => bookingConversations.id, { onDelete: 'cascade' }).notNull(),
  senderId: uuid('sender_id').references(() => users.id),
  senderRole: text('sender_role').notNull(), // 'customer' | 'admin' | 'driver'
  body: text('body'),
  messageType: text('message_type').notNull().default('text'), // 'text' | 'image' | 'audio' | 'admin_note'
  deliveryStatus: text('delivery_status').notNull().default('sent'), // 'sending' | 'sent' | 'delivered' | 'failed'
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => [
  check('booking_messages_guest_sender_check', sql`${table.senderId} IS NOT NULL OR ${table.senderRole} = 'customer'`),
]);

// Message attachments
export const messageAttachments = pgTable('message_attachments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  messageId: uuid('message_id').references(() => bookingMessages.id, { onDelete: 'cascade' }).notNull(),
  url: text('url').notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  fileSize: integer('file_size').notNull(),
  fileName: varchar('file_name', { length: 255 }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
});

// Per-user read state per conversation
export const messageReadState = pgTable('message_read_state', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  conversationId: uuid('conversation_id').references(() => bookingConversations.id, { onDelete: 'cascade' }).notNull(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }).notNull(),
  lastReadMessageId: uuid('last_read_message_id').references(() => bookingMessages.id),
  unreadCount: integer('unread_count').default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// One booking capability represents the roadside guest, never a user account.
export const guestChatReadState = pgTable('guest_chat_read_state', {
  conversationId: uuid('conversation_id').primaryKey().references(() => bookingConversations.id, { onDelete: 'cascade' }),
  lastReadMessageId: uuid('last_read_message_id').references(() => bookingMessages.id, { onDelete: 'set null' }),
  lastReadAt: timestamp('last_read_at', { withTimezone: true }),
});

// ─── Invoices ───────────────────────────────────────────────────────
export const invoices = pgTable('invoices', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceNumber: varchar('invoice_number', { length: 30 }).notNull().unique(),
  bookingId: uuid('booking_id').references(() => bookings.id),
  userId: uuid('user_id').references(() => users.id),
  status: text('status').notNull().default('draft'), // draft | issued | sent | paid | overdue | archived | cancelled
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }),
  customerAddress: text('customer_address'),
  companyName: varchar('company_name', { length: 255 }).notNull(),
  companyAddress: text('company_address').notNull(),
  companyPhone: varchar('company_phone', { length: 30 }).notNull(),
  companyEmail: varchar('company_email', { length: 255 }).notNull(),
  companyVatNumber: varchar('company_vat_number', { length: 30 }),
  issueDate: timestamp('issue_date', { withTimezone: true }).notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  subtotal: decimal('subtotal', { precision: 10, scale: 2 }).notNull(),
  vatRate: decimal('vat_rate', { precision: 5, scale: 2 }).notNull().default('20.00'),
  vatAmount: decimal('vat_amount', { precision: 10, scale: 2 }).notNull(),
  totalAmount: decimal('total_amount', { precision: 10, scale: 2 }).notNull(),
  notes: text('notes'),
  internalNotes: text('internal_notes'),
  sentAt: timestamp('sent_at', { withTimezone: true }),
  archivedAt: timestamp('archived_at', { withTimezone: true }),
  deletedAt: timestamp('deleted_at', { withTimezone: true }),
  createdBy: uuid('created_by').references(() => users.id),
  updatedBy: uuid('updated_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

export const invoiceItems = pgTable('invoice_items', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'cascade' }).notNull(),
  description: text('description').notNull(),
  quantity: integer('quantity').notNull().default(1),
  unitPrice: decimal('unit_price', { precision: 10, scale: 2 }).notNull(),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }).notNull(),
  sortOrder: integer('sort_order').notNull().default(0),
});

// Homepage media slides table
export const homepageMedia = pgTable('homepage_media', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  src: text('src').notNull(),
  alt: text('alt').notNull(),
  eyebrow: varchar('eyebrow', { length: 100 }).notNull(),
  title: varchar('title', { length: 200 }).notNull(),
  caption: text('caption'),
  objectPosition: varchar('object_position', { length: 50 }).notNull().default('center center'),
  sortOrder: integer('sort_order').notNull().default(0),
  isActive: boolean('is_active').notNull().default(true),
  animationStyle: varchar('animation_style', { length: 20 }).notNull().default('fadeZoom'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Visitor analytics tables
export const siteVisitors = pgTable('site_visitors', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  sessionId: varchar('session_id', { length: 64 }).notNull().unique(),
  sourceApp: varchar('source_app', { length: 60 }).notNull().default('tyre_rescue'),
  sourceLabel: varchar('source_label', { length: 120 }).notNull().default('Tyre Rescue'),
  ipHash: varchar('ip_hash', { length: 64 }),
  city: varchar('city', { length: 100 }),
  country: varchar('country', { length: 50 }).default('UK'),
  device: varchar('device', { length: 20 }),
  browser: varchar('browser', { length: 50 }),
  referrer: varchar('referrer', { length: 255 }),
  ageGroup: varchar('age_group', { length: 10 }),
  gender: varchar('gender', { length: 20 }),
  interests: jsonb('interests'),
  consentGiven: boolean('consent_given').default(false),
  sessionDuration: integer('session_duration').default(0),
  isOnline: boolean('is_online').default(true),
  lastHeartbeat: timestamp('last_heartbeat', { withTimezone: true }).default(sql`NOW()`),
  searchKeyword: varchar('search_keyword', { length: 500 }),
  searchEngine: varchar('search_engine', { length: 50 }),
  exitedAt: timestamp('exited_at', { withTimezone: true }),
  visitCount: integer('visit_count').default(1),
  previousVisits: jsonb('previous_visits'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
}, (table) => ({
  sourceAppIdx: index('site_visitors_source_app_idx').on(table.sourceApp),
  sourceAppLiveIdx: index('site_visitors_source_app_live_idx').on(table.sourceApp, table.isOnline, table.lastHeartbeat),
}));

export const visitorPageViews = pgTable('visitor_page_views', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  visitorId: uuid('visitor_id').notNull().references(() => siteVisitors.id),
  path: varchar('path', { length: 500 }).notNull(),
  title: varchar('title', { length: 255 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).default(sql`NOW()`),
});

export const visitorClicks = pgTable('visitor_clicks', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  visitorId: uuid('visitor_id').notNull().references(() => siteVisitors.id),
  buttonText: varchar('button_text', { length: 255 }).notNull(),
  path: varchar('path', { length: 500 }),
  timestamp: timestamp('timestamp', { withTimezone: true }).default(sql`NOW()`),
});

// ── SEO Analytics ──
export const seoSnapshots = pgTable('seo_snapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  date: timestamp('date', { withTimezone: true }).notNull(),
  performanceScore: integer('performance_score'),
  accessibilityScore: integer('accessibility_score'),
  bestPracticesScore: integer('best_practices_score'),
  seoScore: integer('seo_score'),
  lcp: real('lcp'),
  fid: real('fid'),
  cls: real('cls'),
  fcp: real('fcp'),
  ttfb: real('ttfb'),
  totalVisitors: integer('total_visitors').default(0),
  organicVisitors: integer('organic_visitors').default(0),
  directVisitors: integer('direct_visitors').default(0),
  socialVisitors: integer('social_visitors').default(0),
  bounceRate: real('bounce_rate'),
  avgSessionDuration: real('avg_session_duration'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

export const pageAnalysis = pgTable('page_analysis', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  path: varchar('path', { length: 500 }).notNull().unique(),
  title: varchar('title', { length: 500 }),
  metaDescription: varchar('meta_description', { length: 1000 }),
  h1: varchar('h1', { length: 500 }),
  h1Count: integer('h1_count').default(0),
  h2Count: integer('h2_count').default(0),
  imgWithoutAlt: integer('img_without_alt').default(0),
  wordCount: integer('word_count').default(0),
  hasCanonical: boolean('has_canonical').default(false),
  hasOpenGraph: boolean('has_open_graph').default(false),
  hasTwitterCard: boolean('has_twitter_card').default(false),
  hasJsonLd: boolean('has_json_ld').default(false),
  statusCode: integer('status_code'),
  loadTimeMs: integer('load_time_ms'),
  issues: jsonb('issues'),
  lastCrawled: timestamp('last_crawled', { withTimezone: true }).default(sql`NOW()`),
});

// ──────────────────────────────────────────────
// Pricing Configuration (dynamic surcharges)
// ──────────────────────────────────────────────

export const pricingConfig = pgTable('pricing_config', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  baseCalloutFee: decimal('base_callout_fee', { precision: 10, scale: 2 }).default('0.00'),
  baseFittingFee: decimal('base_fitting_fee', { precision: 10, scale: 2 }).default('20.00'),
  nightSurchargePercent: decimal('night_surcharge_percent', { precision: 5, scale: 2 }).default('15.00'),
  nightStartHour: integer('night_start_hour').default(18),
  nightEndHour: integer('night_end_hour').default(6),
  manualSurchargePercent: decimal('manual_surcharge_percent', { precision: 5, scale: 2 }).default('0.00'),
  manualSurchargeActive: boolean('manual_surcharge_active').default(false),
  demandSurchargePercent: decimal('demand_surcharge_percent', { precision: 5, scale: 2 }).default('0.00'),
  demandThresholdClicks: integer('demand_threshold_clicks').default(20),
  demandIncrementPercent: decimal('demand_increment_percent', { precision: 5, scale: 2 }).default('2.00'),
  cookieReturnSurchargePercent: decimal('cookie_return_surcharge_percent', { precision: 5, scale: 2 }).default('0.00'),
  maxTotalSurchargePercent: decimal('max_total_surcharge_percent', { precision: 5, scale: 2 }).default('25.00'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
  updatedBy: uuid('updated_by').references(() => users.id),
});

// ──────────────────────────────────────────────
// Quick Bookings (admin fast-entry)
// ──────────────────────────────────────────────

export const quickBookings = pgTable('quick_bookings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  adminId: uuid('admin_id').references(() => users.id).notNull(),
  customerName: varchar('customer_name', { length: 255 }).notNull(),
  customerPhone: varchar('customer_phone', { length: 20 }).notNull(),
  customerEmail: varchar('customer_email', { length: 255 }),
  locationLat: decimal('location_lat', { precision: 9, scale: 6 }),
  locationLng: decimal('location_lng', { precision: 9, scale: 6 }),
  locationAddress: text('location_address'),
  locationPostcode: varchar('location_postcode', { length: 10 }),
  locationMethod: text('location_method'), // 'link' | 'postcode' | 'address'
  locationLinkToken: varchar('location_link_token', { length: 64 }).unique(),
  locationLinkExpiry: timestamp('location_link_expiry', { withTimezone: true }),
  locationLinkUsed: boolean('location_link_used').default(false),
  serviceType: text('service_type').notNull(), // 'fit' | 'repair' | 'assess' | 'locking_nut'
  tyreSize: varchar('tyre_size', { length: 20 }),
  tyreCount: integer('tyre_count').default(1),
  selectedTyreProductId: uuid('selected_tyre_product_id').references(() => tyreProducts.id),
  selectedTyreUnitPrice: decimal('selected_tyre_unit_price', { precision: 10, scale: 2 }),
  selectedTyreBrand: varchar('selected_tyre_brand', { length: 100 }),
  selectedTyrePattern: varchar('selected_tyre_pattern', { length: 200 }),
  distanceKm: decimal('distance_km', { precision: 8, scale: 2 }),
  basePrice: decimal('base_price', { precision: 10, scale: 2 }),
  surchargePercent: decimal('surcharge_percent', { precision: 5, scale: 2 }).default('0.00'),
  totalPrice: decimal('total_price', { precision: 10, scale: 2 }),
  priceBreakdown: jsonb('price_breakdown'),
  adminAdjustmentAmount: decimal('admin_adjustment_amount', { precision: 10, scale: 2 }).default('0.00'),
  adminAdjustmentReason: text('admin_adjustment_reason'),
  bookingId: uuid('booking_id').references(() => bookings.id),
  status: text('status').notNull().default('pending_location'),
  notes: text('notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// Virtual Landline call-history interactions imported from provider CSV exports.
export const virtualLandlineInteractions = pgTable('virtual_landline_interactions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  provider: varchar('provider', { length: 50 }).notNull().default('virtual_landline'),
  source: varchar('source', { length: 30 }).notNull().default('csv'),
  importKey: varchar('import_key', { length: 128 }).notNull().unique(),
  providerCallId: varchar('provider_call_id', { length: 255 }),
  direction: text('direction').notNull(), // incoming | outgoing | missed | unknown
  callStatus: text('call_status').notNull().default('unknown'),
  callerNumberRaw: varchar('caller_number_raw', { length: 80 }),
  destinationNumberRaw: varchar('destination_number_raw', { length: 80 }),
  callerNumberNormalized: varchar('caller_number_normalized', { length: 20 }),
  destinationNumberNormalized: varchar('destination_number_normalized', { length: 20 }),
  customerPhoneNormalized: varchar('customer_phone_normalized', { length: 20 }),
  startedAt: timestamp('started_at', { withTimezone: true }).notNull(),
  endedAt: timestamp('ended_at', { withTimezone: true }),
  durationSeconds: integer('duration_seconds'),
  recordingUrl: text('recording_url'),
  sourceFileName: varchar('source_file_name', { length: 255 }),
  sourceRowNumber: integer('source_row_number').notNull(),
  rawRow: jsonb('raw_row').notNull(),
  matchedUserId: uuid('matched_user_id').references(() => users.id, { onDelete: 'set null' }),
  linkedBookingId: uuid('linked_booking_id').references(() => bookings.id, { onDelete: 'set null' }),
  linkedQuickBookingId: uuid('linked_quick_booking_id').references(() => quickBookings.id, { onDelete: 'set null' }),
  reviewed: boolean('reviewed').notNull().default(false),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  reviewedBy: uuid('reviewed_by').references(() => users.id, { onDelete: 'set null' }),
  importedBy: uuid('imported_by').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// ──────────────────────────────────────────────
// Admin Quote Drafts (internal operator quotes only)
// ──────────────────────────────────────────────

export const adminQuoteDrafts = pgTable('admin_quote_drafts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  quoteRef: varchar('quote_ref', { length: 20 })
    .notNull()
    .unique()
    .default(sql`'TRQ-' || nextval('admin_quote_ref_seq'::regclass)`),
  customerName: varchar('customer_name', { length: 255 }),
  customerPhone: varchar('customer_phone', { length: 30 }),
  address: text('address'),
  postcode: varchar('postcode', { length: 20 }),
  latitude: decimal('latitude', { precision: 9, scale: 6 }),
  longitude: decimal('longitude', { precision: 9, scale: 6 }),
  tyreSize: varchar('tyre_size', { length: 20 }),
  quantity: integer('quantity').notNull().default(1),
  lockingWheelNutStatus: text('locking_wheel_nut_status'),
  lockingWheelNutChargePence: integer('locking_wheel_nut_charge_pence').default(0),
  priceAmount: integer('price_amount').notNull(),
  currency: varchar('currency', { length: 3 }).notNull().default('GBP'),
  quoteStatus: text('quote_status').$type<AdminQuoteStatus>().notNull().default('DRAFT'),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  confirmedAt: timestamp('confirmed_at', { withTimezone: true }),
  confirmationMethod: text('confirmation_method').$type<AdminQuoteConfirmationMethod>(),
  selectedPaymentOption: text('selected_payment_option').$type<AdminQuotePaymentOption>(),
  quickBookingId: uuid('quick_booking_id').references(() => quickBookings.id, { onDelete: 'set null' }),
  createdByAdminId: uuid('created_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
  internalNotes: text('internal_notes'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

// ──────────────────────────────────────────────
// Demand Snapshots (hourly intelligence)
// ──────────────────────────────────────────────

export const demandSnapshots = pgTable('demand_snapshots', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  hourStart: timestamp('hour_start', { withTimezone: true }).notNull(),
  pageViews: integer('page_views').default(0),
  callClicks: integer('call_clicks').default(0),
  bookingStarts: integer('booking_starts').default(0),
  bookingCompletes: integer('booking_completes').default(0),
  whatsappClicks: integer('whatsapp_clicks').default(0),
  surchargeApplied: decimal('surcharge_applied', { precision: 5, scale: 2 }).default('0.00'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

// ──────────────────────────────────────────────
// Admin Notifications
// ──────────────────────────────────────────────

export const notificationSeverityEnum = pgEnum('notification_severity', [
  'info',
  'success',
  'warning',
  'critical',
]);

export const adminNotifications = pgTable('admin_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  type: text('type').notNull(),
  title: text('title').notNull(),
  body: text('body').notNull(),
  entityType: text('entity_type').notNull(),
  entityId: text('entity_id').notNull(),
  severity: notificationSeverityEnum('severity').default('info').notNull(),
  link: text('link'),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdBy: text('created_by'),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────
// Web Push Subscriptions
// ──────────────────────────────────────────────

export const pushSubscriptions = pgTable('push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: text('user_id').notNull(),
  endpoint: text('endpoint').notNull(),
  p256dh: text('p256dh').notNull(),
  auth: text('auth').notNull(),
  userAgent: text('user_agent'),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────
// Driver push notification history
// ──────────────────────────────────────────────

export const driverNotifications = pgTable('driver_notifications', {
  id: uuid('id').defaultRandom().primaryKey(),
  driverId: uuid('driver_id').references(() => drivers.id).notNull(),
  type: varchar('type', { length: 50 }).notNull(), // new_job, status_update, chat_message, system
  title: text('title').notNull(),
  body: text('body').notNull(),
  bookingRef: varchar('booking_ref', { length: 20 }),
  metadata: jsonb('metadata').$type<Record<string, unknown>>(),
  isRead: boolean('is_read').default(false).notNull(),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────
// Driver App Sound Settings (admin-controlled)
// ──────────────────────────────────────────────

export const driverSoundSettings = pgTable('driver_sound_settings', {
  id: uuid('id').defaultRandom().primaryKey(),
  event: varchar('event', { length: 50 }).unique().notNull(), // new_job, job_accepted, job_completed, new_message
  soundFile: varchar('sound_file', { length: 100 }).notNull().default('new_job.wav'),
  enabled: boolean('enabled').default(true).notNull(),
  volume: real('volume').default(1.0).notNull(),
  vibrationEnabled: boolean('vibration_enabled').default(true).notNull(),
  updatedBy: uuid('updated_by').references(() => users.id),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

// ──────────────────────────────────────────────
// Admin Expo Push Tokens (assisted-chat admin app)
// ──────────────────────────────────────────────

export const adminPushTokens = pgTable('admin_push_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  deviceSessionId: uuid('device_session_id').references(() => adminDeviceSessions.id, { onDelete: 'set null' }),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull().default('android'), // 'android' | 'ios'
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [index('admin_push_tokens_device_session_idx').on(table.deviceSessionId)]);

// ──────────────────────────────────────────────
// Customer Expo Push Tokens
// ──────────────────────────────────────────────

export const customerPushTokens = pgTable('customer_push_tokens', {
  id: uuid('id').defaultRandom().primaryKey(),
  userId: uuid('user_id').references(() => users.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }),
  token: text('token').notNull().unique(),
  platform: text('platform').notNull().default('ios'),
  lastRefNumber: varchar('last_ref_number', { length: 20 }),
  isActive: boolean('is_active').default(true).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// A device may subscribe to several guest bookings without replacing an older
// booking when another reservation is made on the same phone.
export const customerPushSubscriptions = pgTable('customer_push_subscriptions', {
  id: uuid('id').defaultRandom().primaryKey(),
  pushTokenId: uuid('push_token_id').notNull().references(() => customerPushTokens.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  ownerUserId: uuid('owner_user_id').references(() => users.id, { onDelete: 'cascade' }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
}, (table) => [
  uniqueIndex('customer_push_subscriptions_device_booking_idx').on(table.pushTokenId, table.bookingId),
  index('customer_push_subscriptions_booking_idx').on(table.bookingId),
]);

// ──────────────────────────────────────────────
// Driver Sound Assets (uploaded sound files)
// ──────────────────────────────────────────────

export const driverSoundAssets = pgTable('driver_sound_assets', {
  id: uuid('id').defaultRandom().primaryKey(),
  fileName: varchar('file_name', { length: 100 }).notNull(),
  displayName: varchar('display_name', { length: 100 }).notNull(),
  fileUrl: text('file_url').notNull(),
  mimeType: varchar('mime_type', { length: 50 }).notNull().default('audio/wav'),
  fileSize: integer('file_size'),
  uploadedBy: uuid('uploaded_by').references(() => users.id),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
});

// ──────────────────────────────────────────────
// Tracking Sessions (assisted-chat live driver tracking)
// ──────────────────────────────────────────────
//
// One row per booking dispatched from the Assisted Chat mobile app that
// needs browser-based live tracking (driver may not have the native driver
// app open). Two opaque tokens are generated:
//   - customer_token: read-only, embedded in the customer tracking URL
//   - driver_token:   write-capable (start/location/finish), embedded in the
//                     driver tracking URL
// Tokens are 64-char hex (randomBytes(32).toString('hex')), matching the
// existing locationLinkToken convention. Latest driver location is kept
// inline; route history is intentionally out of scope for the MVP.

export const trackingSessions = pgTable('tracking_sessions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }).unique(),
  customerToken: varchar('customer_token', { length: 64 }).notNull().unique(),
  shareVersion: integer('share_version').notNull().default(0),
  driverToken: varchar('driver_token', { length: 64 }).notNull().unique(),
  status: text('status').notNull().default('pending'), // 'pending' | 'in_progress' | 'completed' | 'expired'
  startedAt: timestamp('started_at', { withTimezone: true }),
  completedAt: timestamp('completed_at', { withTimezone: true }),
  lastLatitude: decimal('last_latitude', { precision: 9, scale: 6 }),
  lastLongitude: decimal('last_longitude', { precision: 9, scale: 6 }),
  lastAccuracy: real('last_accuracy'),
  lastHeading: real('last_heading'),
  lastSpeed: real('last_speed'),
  lastUpdatedAt: timestamp('last_updated_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

// ──────────────────────────────────────────────
// B2B API Clients
// ──────────────────────────────────────────────

export const b2bApiClients = pgTable('b2b_api_clients', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 255 }).notNull(),
  companyName: varchar('company_name', { length: 255 }),
  contactName: varchar('contact_name', { length: 255 }),
  contactEmail: varchar('contact_email', { length: 255 }),
  contactPhone: varchar('contact_phone', { length: 30 }),
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'revoked'
  notes: text('notes'),
  createdByAdminId: uuid('created_by_admin_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
});

// ──────────────────────────────────────────────
// B2B API Keys
// ──────────────────────────────────────────────

export const b2bApiKeys = pgTable('b2b_api_keys', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  clientId: uuid('client_id').notNull().references(() => b2bApiClients.id, { onDelete: 'cascade' }),
  keyPrefix: varchar('key_prefix', { length: 30 }).notNull(),
  keyHash: varchar('key_hash', { length: 64 }).notNull().unique(),
  label: varchar('label', { length: 255 }).notNull(),
  status: text('status').notNull().default('active'), // 'active' | 'suspended' | 'revoked'
  allowedScopes: jsonb('allowed_scopes').notNull().default(sql`'[]'::jsonb`),
  allowedPlatforms: jsonb('allowed_platforms').notNull().default(sql`'[]'::jsonb`),
  allowedStockFilters: jsonb('allowed_stock_filters'),
  rateLimitPerMinute: integer('rate_limit_per_minute').notNull().default(60),
  expiresAt: timestamp('expires_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  revokedAt: timestamp('revoked_at', { withTimezone: true }),
});

// ──────────────────────────────────────────────
// B2B API Key Audit Logs
// ──────────────────────────────────────────────

export const b2bApiKeyAuditLogs = pgTable('b2b_api_key_audit_logs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  apiKeyId: uuid('api_key_id').references(() => b2bApiKeys.id, { onDelete: 'set null' }),
  clientId: uuid('client_id').references(() => b2bApiClients.id, { onDelete: 'set null' }),
  action: varchar('action', { length: 100 }).notNull(),
  route: varchar('route', { length: 500 }),
  ipAddress: inet('ip_address'),
  userAgent: text('user_agent'),
  statusCode: integer('status_code'),
  metadata: jsonb('metadata'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

// ──────────────────────────────────────────────
// Tax & Payroll — Phase 1: company identity
// ──────────────────────────────────────────────

export const taxCompanyEntities = pgTable('tax_company_entities', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyNumber: varchar('company_number', { length: 20 }).unique().notNull(),
  legalName: varchar('legal_name', { length: 255 }).notNull(),
  registeredAddressLine1: text('registered_address_line1').notNull(),
  registeredAddressLine2: text('registered_address_line2'),
  registeredCity: varchar('registered_city', { length: 120 }),
  registeredCountry: varchar('registered_country', { length: 120 }),
  registeredPostcode: varchar('registered_postcode', { length: 10 }),
  tradingName: varchar('trading_name', { length: 255 }),
  tradingAddress: text('trading_address'),
  businessEmail: varchar('business_email', { length: 255 }),
  businessPhone: varchar('business_phone', { length: 30 }),
  version: integer('version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('tax_company_entities_company_number_idx').on(table.companyNumber),
]);

export const taxCompanyMemberships = pgTable('tax_company_memberships', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  userId: uuid('user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  capabilities: jsonb('capabilities').$type<string[]>().notNull().default(sql`'["tax.read"]'::jsonb`),
  grantedByUserId: uuid('granted_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('tax_company_memberships_company_user_unique').on(table.companyId, table.userId),
  index('tax_company_memberships_user_idx').on(table.userId),
]);

export const taxCompanyRevisions = pgTable('tax_company_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  changedFields: jsonb('changed_fields').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('tax_company_revisions_company_version_unique').on(table.companyId, table.version),
  index('tax_company_revisions_company_created_idx').on(table.companyId, table.createdAt),
]);

export const taxRegistrationStatuses = pgTable('tax_registration_statuses', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  taxService: text('tax_service').notNull(),
  status: text('status').notNull().default('unknown'),
  declaredByUserId: uuid('declared_by_user_id').references(() => users.id, { onDelete: 'set null' }),
  declaredAt: timestamp('declared_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('tax_registration_statuses_company_service_unique').on(table.companyId, table.taxService),
]);

export const taxAuditEvents = pgTable('tax_audit_events', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  eventType: text('event_type').notNull(),
  actorUserId: uuid('actor_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  payload: jsonb('payload').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('tax_audit_events_company_created_idx').on(table.companyId, table.createdAt),
]);

export type TaxCompanyEntity = typeof taxCompanyEntities.$inferSelect;
export type NewTaxCompanyEntity = typeof taxCompanyEntities.$inferInsert;
export type TaxCompanyMembership = typeof taxCompanyMemberships.$inferSelect;
export type NewTaxCompanyMembership = typeof taxCompanyMemberships.$inferInsert;
export type TaxCompanyRevision = typeof taxCompanyRevisions.$inferSelect;
export type NewTaxCompanyRevision = typeof taxCompanyRevisions.$inferInsert;
export type TaxRegistrationStatus = typeof taxRegistrationStatuses.$inferSelect;
export type NewTaxRegistrationStatus = typeof taxRegistrationStatuses.$inferInsert;
export type TaxAuditEvent = typeof taxAuditEvents.$inferSelect;
export type NewTaxAuditEvent = typeof taxAuditEvents.$inferInsert;

// ─── Tax & Payroll Phase 2A ───────────────────────────────────────────────────

export const payrollEmployees = pgTable('payroll_employees', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  legalFirstName: varchar('legal_first_name', { length: 100 }).notNull(),
  legalSurname: varchar('legal_surname', { length: 100 }).notNull(),
  employeeReference: varchar('employee_reference', { length: 50 }),
  employmentStartDate: date('employment_start_date').notNull(),
  employmentEndDate: date('employment_end_date'),
  isDirector: boolean('is_director').notNull().default(false),
  employeeStatus: text('employee_status').notNull().default('active'),
  dateOfBirth: date('date_of_birth'),
  addressLine1: text('address_line1'),
  addressLine2: text('address_line2'),
  addressCity: varchar('address_city', { length: 120 }),
  addressPostcode: varchar('address_postcode', { length: 10 }),
  taxCode: varchar('tax_code', { length: 20 }),
  taxCodeBasis: text('tax_code_basis'),
  taxCodeEffectiveDate: date('tax_code_effective_date'),
  taxCodeSource: text('tax_code_source'),
  niCategory: varchar('ni_category', { length: 5 }),
  linkedUserId: uuid('linked_user_id').references(() => users.id, { onDelete: 'set null' }),
  payrollIdMigrationRef: varchar('payroll_id_migration_ref', { length: 100 }),
  version: integer('version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('payroll_employees_company_ref_unique').on(table.companyId, table.employeeReference),
  index('payroll_employees_company_idx').on(table.companyId),
  index('payroll_employees_linked_user_idx').on(table.linkedUserId),
]);

export const payrollEmployeeSensitive = pgTable('payroll_employee_sensitive', {
  employeeId: uuid('employee_id').primaryKey().references(() => payrollEmployees.id, { onDelete: 'cascade' }),
  ninoEncrypted: text('nino_encrypted'),
  ninoKeyVersion: varchar('nino_key_version', { length: 20 }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedByUserId: uuid('updated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
});

export const payrollEmployeeStarterData = pgTable('payroll_employee_starter_data', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'cascade' }),
  sourceType: text('source_type').notNull(),
  sourceReference: text('source_reference'),
  p45LeavingDate: date('p45_leaving_date'),
  p45TotalPayPrevEmployment: decimal('p45_total_pay_prev_employment', { precision: 13, scale: 4 }),
  p45TotalTaxPrevEmployment: decimal('p45_total_tax_prev_employment', { precision: 13, scale: 4 }),
  p45TaxCode: varchar('p45_tax_code', { length: 20 }),
  p45Week1Month1: boolean('p45_week1_month1'),
  starterDeclaration: varchar('starter_declaration', { length: 1 }),
  studentLoanPlans: jsonb('student_loan_plans').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  postgraduateLoan: boolean('postgraduate_loan').notNull().default(false),
  studentLoanUnknown: boolean('student_loan_unknown').notNull().default(false),
  openingYtdTaxYear: varchar('opening_ytd_tax_year', { length: 9 }),
  openingYtdEffectiveDate: date('opening_ytd_effective_date'),
  openingYtdGrossPay: decimal('opening_ytd_gross_pay', { precision: 13, scale: 4 }),
  openingYtdTaxPaid: decimal('opening_ytd_tax_paid', { precision: 13, scale: 4 }),
  openingYtdNiEmployee: decimal('opening_ytd_ni_employee', { precision: 13, scale: 4 }),
  openingYtdNiEmployer: decimal('opening_ytd_ni_employer', { precision: 13, scale: 4 }),
  openingYtdStudentLoanDeductions: decimal('opening_ytd_student_loan_deductions', { precision: 13, scale: 4 }),
  openingYtdPensionEmployee: decimal('opening_ytd_pension_employee', { precision: 13, scale: 4 }),
  openingYtdPensionEmployer: decimal('opening_ytd_pension_employer', { precision: 13, scale: 4 }),
  openingYtdCompleteness: text('opening_ytd_completeness').default('incomplete'),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  recordedAt: timestamp('recorded_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_employee_starter_data_employee_idx').on(table.employeeId),
  check('payroll_employee_starter_source_check', sql`${table.sourceType} IN ('p45', 'starter_checklist', 'none_confirmed', 'first_payroll_this_tax_year', 'current_employment_opening')`),
]);

export const payrollEmployeeRevisions = pgTable('payroll_employee_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  changedFields: jsonb('changed_fields').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('payroll_employee_revisions_emp_version_unique').on(table.employeeId, table.version),
  index('payroll_employee_revisions_company_idx').on(table.companyId),
]);

export const payrollPayTerms = pgTable('payroll_pay_terms', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'restrict' }),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  payBasis: text('pay_basis').notNull(),
  hourlyRate: decimal('hourly_rate', { precision: 10, scale: 4 }),
  fixedPeriodGross: decimal('fixed_period_gross', { precision: 13, scale: 4 }),
  currency: varchar('currency', { length: 3 }).notNull().default('GBP'),
  annualSalaryNote: decimal('annual_salary_note', { precision: 13, scale: 4 }),
  payFrequency: text('pay_frequency').notNull(),
  contractedHoursPerWeek: decimal('contracted_hours_per_week', { precision: 6, scale: 2 }),
  effectiveFrom: date('effective_from').notNull(),
  effectiveTo: date('effective_to'),
  sourceNote: text('source_note'),
  version: integer('version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_pay_terms_employee_effective_idx').on(table.employeeId, table.effectiveFrom),
  index('payroll_pay_terms_company_idx').on(table.companyId),
]);

export const payrollSettings = pgTable('payroll_settings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').unique().notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  scheduleLabel: varchar('schedule_label', { length: 100 }).notNull(),
  payFrequency: text('pay_frequency').notNull(),
  scheduleAnchorDate: date('schedule_anchor_date'),
  monthlyPayDay: integer('monthly_pay_day'),
  timezone: varchar('timezone', { length: 50 }).notNull().default('Europe/London'),
  // Phase 2B — RTI / HMRC references
  payeReference: varchar('paye_reference', { length: 20 }),
  accountsOfficeRef: varchar('accounts_office_ref', { length: 25 }),
  employerPensionSchemeRef: varchar('employer_pension_scheme_ref', { length: 50 }),
  pensionProviderName: varchar('pension_provider_name', { length: 200 }),
  employeePensionRate: decimal('employee_pension_rate', { precision: 6, scale: 4 }),
  employerPensionRate: decimal('employer_pension_rate', { precision: 6, scale: 4 }),
  pensionContributionBasis: text('pension_contribution_basis'),
  version: integer('version').notNull().default(1),
  activatedByUserId: uuid('activated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
});

export const payrollSettingsRevisions = pgTable('payroll_settings_revisions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  settingsId: uuid('settings_id').notNull().references(() => payrollSettings.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull(),
  version: integer('version').notNull(),
  snapshot: jsonb('snapshot').$type<Record<string, unknown>>().notNull(),
  changedFields: jsonb('changed_fields').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  changedByUserId: uuid('changed_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('payroll_settings_revisions_settings_version_unique').on(table.settingsId, table.version),
]);

export const payrollRuns = pgTable('payroll_runs', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  settingsId: uuid('settings_id').notNull().references(() => payrollSettings.id, { onDelete: 'restrict' }),
  settingsVersionAtCreation: integer('settings_version_at_creation').notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  intendedPaymentDate: date('intended_payment_date').notNull(),
  runStatus: text('run_status').notNull().default('draft'),
  version: integer('version').notNull().default(1),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_runs_company_idx').on(table.companyId, table.createdAt),
  check('payroll_runs_status_check', sql`${table.runStatus} IN ('draft', 'submitted_for_review', 'approved', 'finalised', 'cancelled')`),
]);

export const payrollRunLines = pgTable('payroll_run_lines', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'restrict' }),
  payTermsId: uuid('pay_terms_id').references(() => payrollPayTerms.id, { onDelete: 'restrict' }),
  payTermsVersionAtEntry: integer('pay_terms_version_at_entry'),
  lineType: text('line_type').notNull(),
  workedMinutes: integer('worked_minutes'),
  hourlyRateOverride: decimal('hourly_rate_override', { precision: 10, scale: 4 }),
  resolvedHourlyRate: decimal('resolved_hourly_rate', { precision: 10, scale: 4 }),
  fixedAmount: decimal('fixed_amount', { precision: 13, scale: 4 }),
  description: text('description'),
  enteredByUserId: uuid('entered_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_run_lines_run_idx').on(table.runId),
  index('payroll_run_lines_employee_run_idx').on(table.employeeId, table.runId),
]);

export const payrollRunPreviews = pgTable('payroll_run_previews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  runVersionAtCalc: integer('run_version_at_calc').notNull(),
  settingsVersionAtCalc: integer('settings_version_at_calc').notNull(),
  companyVersionAtCalc: integer('company_version_at_calc').notNull(),
  inputSnapshot: jsonb('input_snapshot').$type<Record<string, unknown>>().notNull(),
  inputHash: varchar('input_hash', { length: 64 }).notNull(),
  perEmployeeResults: jsonb('per_employee_results').$type<unknown[]>().notNull(),
  grossTotal: decimal('gross_total', { precision: 13, scale: 4 }),
  supportedSubtotal: decimal('supported_subtotal', { precision: 13, scale: 4 }),
  hasUnsupportedLines: boolean('has_unsupported_lines').notNull().default(false),
  completenessState: text('completeness_state').notNull(),
  calcPolicyVersion: varchar('calc_policy_version', { length: 20 }).notNull().default('v1'),
  taxNotCalculated: boolean('tax_not_calculated').notNull().default(true),
  netPayNotCalculated: boolean('net_pay_not_calculated').notNull().default(true),
  calculatedByUserId: uuid('calculated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  calculatedAt: timestamp('calculated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_run_previews_run_idx').on(table.runId, table.calculatedAt),
]);

export const payrollIdempotencyKeys = pgTable('payroll_idempotency_keys', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  intent: varchar('intent', { length: 100 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  resultId: uuid('result_id'),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('payroll_idempotency_company_key_unique').on(table.companyId, table.idempotencyKey),
  index('payroll_idempotency_keys_company_idx').on(table.companyId),
]);

export type PayrollEmployee = typeof payrollEmployees.$inferSelect;
export type NewPayrollEmployee = typeof payrollEmployees.$inferInsert;
export type PayrollEmployeeSensitive = typeof payrollEmployeeSensitive.$inferSelect;
export type NewPayrollEmployeeSensitive = typeof payrollEmployeeSensitive.$inferInsert;
export type PayrollEmployeeStarterData = typeof payrollEmployeeStarterData.$inferSelect;
export type NewPayrollEmployeeStarterData = typeof payrollEmployeeStarterData.$inferInsert;
export type PayrollEmployeeRevision = typeof payrollEmployeeRevisions.$inferSelect;
export type NewPayrollEmployeeRevision = typeof payrollEmployeeRevisions.$inferInsert;
export type PayrollPayTerms = typeof payrollPayTerms.$inferSelect;
export type NewPayrollPayTerms = typeof payrollPayTerms.$inferInsert;
export type PayrollSettings = typeof payrollSettings.$inferSelect;
export type NewPayrollSettings = typeof payrollSettings.$inferInsert;
export type PayrollSettingsRevision = typeof payrollSettingsRevisions.$inferSelect;
export type NewPayrollSettingsRevision = typeof payrollSettingsRevisions.$inferInsert;
export type PayrollRun = typeof payrollRuns.$inferSelect;
export type NewPayrollRun = typeof payrollRuns.$inferInsert;
export type PayrollRunLine = typeof payrollRunLines.$inferSelect;
export type NewPayrollRunLine = typeof payrollRunLines.$inferInsert;
export type PayrollRunPreview = typeof payrollRunPreviews.$inferSelect;
export type NewPayrollRunPreview = typeof payrollRunPreviews.$inferInsert;
export type PayrollIdempotencyKey = typeof payrollIdempotencyKeys.$inferSelect;
export type NewPayrollIdempotencyKey = typeof payrollIdempotencyKeys.$inferInsert;

// Type exports for use throughout the application
export type TrackingSession = typeof trackingSessions.$inferSelect;
export type NewTrackingSession = typeof trackingSessions.$inferInsert;

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type TyreCatalogueItem = typeof tyreCatalogue.$inferSelect;
export type NewTyreCatalogueItem = typeof tyreCatalogue.$inferInsert;
export type TyreProduct = typeof tyreProducts.$inferSelect;
export type NewTyreProduct = typeof tyreProducts.$inferInsert;
export type StockCity = typeof stockCities.$inferSelect;
export type NewStockCity = typeof stockCities.$inferInsert;
export type StockUserCityAccess = typeof stockUserCityAccess.$inferSelect;
export type NewStockUserCityAccess = typeof stockUserCityAccess.$inferInsert;
export type StockShift = typeof stockShifts.$inferSelect;
export type NewStockShift = typeof stockShifts.$inferInsert;
export type StockInventoryBalance = typeof stockInventoryBalances.$inferSelect;
export type NewStockInventoryBalance = typeof stockInventoryBalances.$inferInsert;
export type VehicleTyreFitment = typeof vehicleTyreFitments.$inferSelect;
export type NewVehicleTyreFitment = typeof vehicleTyreFitments.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingTyre = typeof bookingTyres.$inferSelect;
export type NewBookingTyre = typeof bookingTyres.$inferInsert;
export type WheelNutConsent = typeof wheelNutConsents.$inferSelect;
export type NewWheelNutConsent = typeof wheelNutConsents.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type HomepageMedia = typeof homepageMedia.$inferSelect;
export type NewHomepageMedia = typeof homepageMedia.$inferInsert;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type BookingStatusHistory = typeof bookingStatusHistory.$inferSelect;
export type InventoryReservation = typeof inventoryReservations.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type StockReservation = typeof stockReservations.$inferSelect;
export type NewStockReservation = typeof stockReservations.$inferInsert;
export type StockMovement = typeof stockMovements.$inferSelect;
export type NewStockMovement = typeof stockMovements.$inferInsert;
export type MissingTyreRequest = typeof missingTyreRequests.$inferSelect;
export type NewMissingTyreRequest = typeof missingTyreRequests.$inferInsert;
export type Payment = typeof payments.$inferSelect;
export type PaymentEvent = typeof paymentEvents.$inferSelect;
export type NewPaymentEvent = typeof paymentEvents.$inferInsert;
export type Refund = typeof refunds.$inferSelect;
export type PricingRule = typeof pricingRules.$inferSelect;
export type Account = typeof accounts.$inferSelect;
export type NewAccount = typeof accounts.$inferInsert;
export type AvailabilitySlot = typeof availabilitySlots.$inferSelect;
export type BankHoliday = typeof bankHolidays.$inferSelect;
export type ServiceArea = typeof serviceAreas.$inferSelect;
export type AuditLog = typeof auditLogs.$inferSelect;
export type Notification = typeof notifications.$inferSelect;
export type Testimonial = typeof testimonials.$inferSelect;
export type FAQ = typeof faqs.$inferSelect;
export type ChatSession = typeof chatSessions.$inferSelect;
export type AgentMemoryRow = typeof agentMemory.$inferSelect;
export type NewAgentMemory = typeof agentMemory.$inferInsert;
export type DriverLocationHistory = typeof driverLocationHistory.$inferSelect;
export type SurgePricingLog = typeof surgePricingLog.$inferSelect;
export type Quote = typeof quotes.$inferSelect;
export type NewQuote = typeof quotes.$inferInsert;
export type PasswordResetToken = typeof passwordResetTokens.$inferSelect;
export type EmailVerificationToken = typeof emailVerificationTokens.$inferSelect;
export type AiCallSession = typeof aiCallSessions.$inferSelect;
export type NewAiCallSession = typeof aiCallSessions.$inferInsert;
export type CallMeBack = typeof callMeBack.$inferSelect;
export type NewCallMeBack = typeof callMeBack.$inferInsert;
export type ContactMessage = typeof contactMessages.$inferSelect;
export type NewContactMessage = typeof contactMessages.$inferInsert;
export type CookieSetting = typeof cookieSettings.$inferSelect;
export type NewCookieSetting = typeof cookieSettings.$inferInsert;
export type AdminChatSetting = typeof adminChatSettings.$inferSelect;
export type NewAdminChatSetting = typeof adminChatSettings.$inferInsert;
export type BookingConversation = typeof bookingConversations.$inferSelect;
export type NewBookingConversation = typeof bookingConversations.$inferInsert;
export type ConversationParticipant = typeof conversationParticipants.$inferSelect;
export type BookingMessage = typeof bookingMessages.$inferSelect;
export type NewBookingMessage = typeof bookingMessages.$inferInsert;
export type MessageAttachment = typeof messageAttachments.$inferSelect;
export type MessageReadStateRow = typeof messageReadState.$inferSelect;
export type SiteVisitor = typeof siteVisitors.$inferSelect;
export type NewSiteVisitor = typeof siteVisitors.$inferInsert;
export type VisitorPageView = typeof visitorPageViews.$inferSelect;
export type VisitorClick = typeof visitorClicks.$inferSelect;
export type SeoSnapshot = typeof seoSnapshots.$inferSelect;
export type PageAnalysis = typeof pageAnalysis.$inferSelect;
export type AdminNotification = typeof adminNotifications.$inferSelect;
export type NewAdminNotification = typeof adminNotifications.$inferInsert;
export type PushSubscription = typeof pushSubscriptions.$inferSelect;
export type NewPushSubscription = typeof pushSubscriptions.$inferInsert;
export type CustomerPushToken = typeof customerPushTokens.$inferSelect;
export type NewCustomerPushToken = typeof customerPushTokens.$inferInsert;
export type PricingConfig = typeof pricingConfig.$inferSelect;
export type NewPricingConfig = typeof pricingConfig.$inferInsert;
export type QuickBooking = typeof quickBookings.$inferSelect;
export type NewQuickBooking = typeof quickBookings.$inferInsert;
export type AdminQuoteDraft = typeof adminQuoteDrafts.$inferSelect;
export type NewAdminQuoteDraft = typeof adminQuoteDrafts.$inferInsert;
export type DemandSnapshot = typeof demandSnapshots.$inferSelect;
export type NewDemandSnapshot = typeof demandSnapshots.$inferInsert;
export type DriverNotification = typeof driverNotifications.$inferSelect;
export type NewDriverNotification = typeof driverNotifications.$inferInsert;
export type DriverSoundSetting = typeof driverSoundSettings.$inferSelect;
export type NewDriverSoundSetting = typeof driverSoundSettings.$inferInsert;
export type DriverSoundAsset = typeof driverSoundAssets.$inferSelect;
export type NewDriverSoundAsset = typeof driverSoundAssets.$inferInsert;
export type B2BApiClient = typeof b2bApiClients.$inferSelect;
export type NewB2BApiClient = typeof b2bApiClients.$inferInsert;
export type B2BApiKey = typeof b2bApiKeys.$inferSelect;
export type NewB2BApiKey = typeof b2bApiKeys.$inferInsert;
export type B2BApiKeyAuditLog = typeof b2bApiKeyAuditLogs.$inferSelect;
export type NewB2BApiKeyAuditLog = typeof b2bApiKeyAuditLogs.$inferInsert;

// ─── Tax & Payroll Phase 2B–5 ─────────────────────────────────────────────────

export const payrollRunFinalisedResults = pgTable('payroll_run_finalised_results', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  runId: uuid('run_id').notNull().references(() => payrollRuns.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'restrict' }),
  taxYear: varchar('tax_year', { length: 9 }).notNull(),
  periodNumber: integer('period_number').notNull(),
  grossPayPence: integer('gross_pay_pence').notNull(),
  taxForPeriodPence: integer('tax_for_period_pence').notNull(),
  employeeNiPence: integer('employee_ni_pence').notNull(),
  employerNiPence: integer('employer_ni_pence').notNull(),
  studentLoanPence: integer('student_loan_pence').notNull().default(0),
  pensionEmployeePence: integer('pension_employee_pence').notNull().default(0),
  pensionEmployerPence: integer('pension_employer_pence').notNull().default(0),
  netPayPence: integer('net_pay_pence').notNull(),
  totalDeductionsPence: integer('total_deductions_pence').notNull(),
  taxCode: varchar('tax_code', { length: 20 }).notNull(),
  niCategory: varchar('ni_category', { length: 5 }).notNull(),
  calculationStatus: text('calculation_status').notNull(),
  warnings: jsonb('warnings').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  ytdSnapshot: jsonb('ytd_snapshot').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('payroll_run_finalised_results_run_idx').on(table.runId),
  uniqueIndex('payroll_run_finalised_results_run_emp_unique').on(table.runId, table.employeeId),
]);

export const taxReviews = pgTable('tax_reviews', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  entityType: text('entity_type').notNull(),
  entityId: uuid('entity_id').notNull(),
  submittedByUserId: uuid('submitted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  reviewedByUserId: uuid('reviewed_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  status: text('status').notNull().default('pending'),
  notes: text('notes'),
  calculationInputHash: varchar('calculation_input_hash', { length: 64 }),
  submittedAt: timestamp('submitted_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  reviewedAt: timestamp('reviewed_at', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  version: integer('version').notNull().default(1),
}, (table) => [
  index('tax_reviews_company_entity_idx').on(table.companyId, table.entityId),
  index('tax_reviews_company_status_idx').on(table.companyId, table.status),
]);

export const payrollEmployeeEnrolments = pgTable('payroll_employee_enrolments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  employeeId: uuid('employee_id').notNull().references(() => payrollEmployees.id, { onDelete: 'restrict' }),
  enrolmentStatus: text('enrolment_status').notNull().default('not_assessed'),
  workerCategory: text('worker_category'),
  enrolmentDate: date('enrolment_date'),
  optOutDate: date('opt_out_date'),
  optOutWindowEnds: date('opt_out_window_ends'),
  cessationDate: date('cessation_date'),
  lastAssessmentDate: date('last_assessment_date'),
  lastAssessmentAnnualisedEarningsPence: integer('last_assessment_annualised_earnings_pence'),
  thresholdsVersion: varchar('thresholds_version', { length: 10 }),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('payroll_employee_enrolments_company_emp_unique').on(table.companyId, table.employeeId),
]);

export const ledgerAccounts = pgTable('ledger_accounts', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  code: varchar('code', { length: 20 }).notNull(),
  name: varchar('name', { length: 200 }).notNull(),
  accountType: text('account_type').notNull(),
  normalBalance: text('normal_balance').notNull(),
  parentCode: varchar('parent_code', { length: 20 }),
  isSystemAccount: boolean('is_system_account').notNull().default(false),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('ledger_accounts_company_code_unique').on(table.companyId, table.code),
]);

export const journalEntries = pgTable('journal_entries', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  reference: text('reference').notNull(),
  referenceType: text('reference_type').notNull(),
  transactionDate: date('transaction_date').notNull(),
  narration: text('narration').notNull(),
  postedAt: timestamp('posted_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  postedByUserId: uuid('posted_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (table) => [
  index('journal_entries_company_date_idx').on(table.companyId, table.transactionDate),
  index('journal_entries_reference_idx').on(table.companyId, table.reference),
]);

export const journalLines = pgTable('journal_lines', {
  id: uuid('id').primaryKey(),
  journalId: uuid('journal_id').notNull().references(() => journalEntries.id, { onDelete: 'cascade' }),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  accountId: uuid('account_id').notNull().references(() => ledgerAccounts.id, { onDelete: 'restrict' }),
  accountCode: varchar('account_code', { length: 20 }).notNull(),
  debitPence: integer('debit_pence').notNull().default(0),
  creditPence: integer('credit_pence').notNull().default(0),
  narration: text('narration'),
}, (table) => [
  index('journal_lines_journal_idx').on(table.journalId),
  index('journal_lines_account_idx').on(table.companyId, table.accountId),
]);

export const vatPeriods = pgTable('vat_periods', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  periodKey: varchar('period_key', { length: 10 }).notNull(),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  dueDate: date('due_date').notNull(),
  status: text('status').notNull().default('open'),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('vat_periods_company_period_key_unique').on(table.companyId, table.periodKey),
]);

export const vatReturns = pgTable('vat_returns', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  periodId: uuid('period_id').notNull().references(() => vatPeriods.id, { onDelete: 'restrict' }),
  periodKey: varchar('period_key', { length: 10 }).notNull(),
  box1OutputTaxPence: integer('box1_output_tax_pence').notNull().default(0),
  box2AcquisitionTaxPence: integer('box2_acquisition_tax_pence').notNull().default(0),
  box3TotalOutputPence: integer('box3_total_output_pence').notNull().default(0),
  box4InputTaxClaimedPence: integer('box4_input_tax_claimed_pence').notNull().default(0),
  box5NetVatPayablePence: integer('box5_net_vat_payable_pence').notNull(),
  box6TotalSalesNetPence: integer('box6_total_sales_net_pence').notNull().default(0),
  box7TotalPurchasesNetPence: integer('box7_total_purchases_net_pence').notNull().default(0),
  box8GoodsSuppliedNetPence: integer('box8_goods_supplied_net_pence').notNull().default(0),
  box9GoodsAcquiredNetPence: integer('box9_goods_acquired_net_pence').notNull().default(0),
  transactionCount: integer('transaction_count').notNull().default(0),
  status: text('status').notNull().default('draft'),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  submissionCorrelationId: varchar('submission_correlation_id', { length: 100 }),
  calculatedByUserId: uuid('calculated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('vat_returns_company_period_unique').on(table.companyId, table.periodId),
]);

export const corporationTaxPeriods = pgTable('corporation_tax_periods', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  periodStart: date('period_start').notNull(),
  periodEnd: date('period_end').notNull(),
  status: text('status').notNull().default('open'),
  tradingProfitsPence: integer('trading_profits_pence').notNull().default(0),
  nonTradingIncomePence: integer('non_trading_income_pence').notNull().default(0),
  chargeableGainsPence: integer('chargeable_gains_pence').notNull().default(0),
  exemptDistributionsPence: integer('exempt_distributions_pence').notNull().default(0),
  associatedCompanies: integer('associated_companies').notNull().default(0),
  taxableTotalProfitsPence: integer('taxable_total_profits_pence').notNull().default(0),
  netCtPayablePence: integer('net_ct_payable_pence').notNull().default(0),
  marginalReliefPence: integer('marginal_relief_pence').notNull().default(0),
  mainRateTaxPence: integer('main_rate_tax_pence').notNull().default(0),
  rateApplied: text('rate_applied'),
  effectiveRateBps: integer('effective_rate_bps'),
  ct600Boxes: jsonb('ct600_boxes').$type<Record<string, unknown>>().default(sql`'{}'::jsonb`),
  calculatedByUserId: uuid('calculated_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  uniqueIndex('corporation_tax_periods_company_start_unique').on(table.companyId, table.periodStart),
]);

export const rtiSubmissions = pgTable('rti_submissions', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  submissionType: text('submission_type').notNull(),
  taxYear: varchar('tax_year', { length: 9 }).notNull(),
  taxMonth: integer('tax_month'),
  paymentDate: date('payment_date'),
  runId: uuid('run_id').references(() => payrollRuns.id, { onDelete: 'set null' }),
  status: text('status').notNull().default('draft'),
  xmlPayloadHash: varchar('xml_payload_hash', { length: 64 }),
  xmlPayload: text('xml_payload'),
  employeeCount: integer('employee_count').notNull().default(0),
  validationWarnings: jsonb('validation_warnings').$type<string[]>().default(sql`'[]'::jsonb`),
  submittedAt: timestamp('submitted_at', { withTimezone: true }),
  correlationId: varchar('correlation_id', { length: 100 }),
  createdByUserId: uuid('created_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  version: integer('version').notNull().default(1),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
}, (table) => [
  index('rti_submissions_company_type_idx').on(table.companyId, table.submissionType, table.createdAt),
  index('rti_submissions_run_idx').on(table.runId),
]);

export const taxDocuments = pgTable('tax_documents', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  entityId: uuid('entity_id').notNull(),
  filename: varchar('filename', { length: 200 }).notNull(),
  mimeType: varchar('mime_type', { length: 100 }).notNull(),
  contentHash: varchar('content_hash', { length: 64 }).notNull(),
  sizeBytes: integer('size_bytes').notNull(),
  contentBlob: bytea('content_blob').notNull(),
  metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().default(sql`NOW()`),
  generatedByUserId: uuid('generated_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
}, (table) => [
  index('tax_documents_company_entity_idx').on(table.companyId, table.entityId),
  uniqueIndex('tax_documents_company_hash_unique').on(table.companyId, table.contentHash),
]);

export const taxNotifications = pgTable('tax_notifications', {
  id: uuid('id').primaryKey(),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'cascade' }),
  recipientUserId: uuid('recipient_user_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  kind: text('kind').notNull(),
  severity: text('severity').notNull().default('info'),
  title: varchar('title', { length: 200 }).notNull(),
  body: text('body').notNull(),
  entityType: text('entity_type'),
  entityId: uuid('entity_id'),
  readAt: timestamp('read_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(sql`NOW()`),
}, (table) => [
  index('tax_notifications_recipient_idx').on(table.companyId, table.recipientUserId, table.createdAt),
]);

export type PayrollRunFinalisedResult = typeof payrollRunFinalisedResults.$inferSelect;
export type NewPayrollRunFinalisedResult = typeof payrollRunFinalisedResults.$inferInsert;

// Manual evidence of PAYE remittances and explained adjustments. These records
// neither initiate payments nor confirm receipt/acceptance by HMRC.
export const payrollHmrcPayments = pgTable('payroll_hmrc_payments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  periodStart: date('period_start').notNull(),
  amountPence: integer('amount_pence').notNull(),
  paidOn: date('paid_on').notNull(),
  reference: varchar('reference', { length: 120 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidReason: varchar('void_reason', { length: 500 }),
  voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  voidIdempotencyKey: varchar('void_idempotency_key', { length: 128 }),
  voidPayloadHash: varchar('void_payload_hash', { length: 64 }),
}, (table) => [
  uniqueIndex('payroll_hmrc_payments_company_key_unique').on(table.companyId, table.idempotencyKey),
  uniqueIndex('payroll_hmrc_payments_receipt_unique').on(table.companyId, table.paidOn, sql`lower(btrim(${table.reference}))`, table.amountPence).where(sql`${table.voidedAt} IS NULL`),
  uniqueIndex('payroll_hmrc_payments_void_key_unique').on(table.companyId, table.voidIdempotencyKey),
  index('payroll_hmrc_payments_company_period_idx').on(table.companyId, table.periodStart),
  check('payroll_hmrc_payments_positive_amount', sql`${table.amountPence} > 0 AND ${table.amountPence} <= 2000000000`),
  check('payroll_hmrc_payments_tax_month_start', sql`EXTRACT(DAY FROM ${table.periodStart}) = 6`),
]);

export const payrollHmrcAdjustments = pgTable('payroll_hmrc_adjustments', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  companyId: uuid('company_id').notNull().references(() => taxCompanyEntities.id, { onDelete: 'restrict' }),
  periodStart: date('period_start').notNull(),
  amountPence: integer('amount_pence').notNull(),
  reason: varchar('reason', { length: 500 }).notNull(),
  idempotencyKey: varchar('idempotency_key', { length: 128 }).notNull(),
  payloadHash: varchar('payload_hash', { length: 64 }).notNull(),
  recordedByUserId: uuid('recorded_by_user_id').notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`).notNull(),
  voidedAt: timestamp('voided_at', { withTimezone: true }),
  voidReason: varchar('void_reason', { length: 500 }),
  voidedByUserId: uuid('voided_by_user_id').references(() => users.id, { onDelete: 'restrict' }),
  voidIdempotencyKey: varchar('void_idempotency_key', { length: 128 }),
  voidPayloadHash: varchar('void_payload_hash', { length: 64 }),
}, (table) => [
  uniqueIndex('payroll_hmrc_adjustments_company_key_unique').on(table.companyId, table.idempotencyKey),
  uniqueIndex('payroll_hmrc_adjustments_evidence_unique').on(table.companyId, table.periodStart, table.amountPence, sql`lower(btrim(${table.reason}))`).where(sql`${table.voidedAt} IS NULL`),
  uniqueIndex('payroll_hmrc_adjustments_void_key_unique').on(table.companyId, table.voidIdempotencyKey),
  index('payroll_hmrc_adjustments_company_period_idx').on(table.companyId, table.periodStart),
  check('payroll_hmrc_adjustments_nonzero_amount', sql`${table.amountPence} <> 0 AND ${table.amountPence} BETWEEN -2000000000 AND 2000000000`),
  check('payroll_hmrc_adjustments_tax_month_start', sql`EXTRACT(DAY FROM ${table.periodStart}) = 6`),
]);

export type PayrollHmrcPayment = typeof payrollHmrcPayments.$inferSelect;
export type PayrollHmrcAdjustment = typeof payrollHmrcAdjustments.$inferSelect;
export type TaxReview = typeof taxReviews.$inferSelect;
export type NewTaxReview = typeof taxReviews.$inferInsert;
export type PayrollEmployeeEnrolment = typeof payrollEmployeeEnrolments.$inferSelect;
export type NewPayrollEmployeeEnrolment = typeof payrollEmployeeEnrolments.$inferInsert;
export type LedgerAccount = typeof ledgerAccounts.$inferSelect;
export type NewLedgerAccount = typeof ledgerAccounts.$inferInsert;
export type JournalEntry = typeof journalEntries.$inferSelect;
export type NewJournalEntry = typeof journalEntries.$inferInsert;
export type JournalLine = typeof journalLines.$inferSelect;
export type NewJournalLine = typeof journalLines.$inferInsert;
export type VatPeriod = typeof vatPeriods.$inferSelect;
export type NewVatPeriod = typeof vatPeriods.$inferInsert;
export type VatReturn = typeof vatReturns.$inferSelect;
export type NewVatReturn = typeof vatReturns.$inferInsert;
export type CorporationTaxPeriod = typeof corporationTaxPeriods.$inferSelect;
export type NewCorporationTaxPeriod = typeof corporationTaxPeriods.$inferInsert;
export type RtiSubmission = typeof rtiSubmissions.$inferSelect;
export type NewRtiSubmission = typeof rtiSubmissions.$inferInsert;
export type TaxDocument = typeof taxDocuments.$inferSelect;
export type NewTaxDocument = typeof taxDocuments.$inferInsert;
export type TaxNotification = typeof taxNotifications.$inferSelect;
export type NewTaxNotification = typeof taxNotifications.$inferInsert;

// Admin-only inferred journeys. These never change booking assignment or
// expose a proposed driver's coordinates through customer tracking links.
export const driverJourneyStates = pgTable('driver_journey_states', {
  driverId: uuid('driver_id').primaryKey().references(() => drivers.id, { onDelete: 'cascade' }),
  fixes: jsonb('fixes').notNull().default(sql`'[]'::jsonb`),
  leaseToken: uuid('lease_token'),
  leaseUntil: timestamp('lease_until', { withTimezone: true }),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const driverJourneyObservations = pgTable('driver_journey_observations', {
  id: uuid('id').primaryKey().defaultRandom(),
  driverId: uuid('driver_id').notNull().references(() => drivers.id, { onDelete: 'cascade' }),
  bookingId: uuid('booking_id').notNull().references(() => bookings.id, { onDelete: 'cascade' }),
  serviceDay: varchar('service_day', { length: 10 }).notNull(),
  status: text('status').notNull().default('pending'),
  revision: integer('revision').notNull().default(0),
  state: jsonb('state').$type<Record<string, unknown>>().notNull().default(sql`'{}'::jsonb`),
  inferredAt: timestamp('inferred_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  lastEvidenceAt: timestamp('last_evidence_at', { withTimezone: true }).notNull(),
  respondedAt: timestamp('responded_at', { withTimezone: true }),
  respondedBy: uuid('responded_by').references(() => users.id),
}, (table) => [
  index('driver_journey_driver_booking_day_idx').on(table.driverId, table.bookingId, table.serviceDay),
  uniqueIndex('driver_journey_one_active_per_driver').on(table.driverId).where(sql`${table.status} IN ('pending', 'confirmed')`),
  index('driver_journey_booking_idx').on(table.bookingId),
]);

export const driverJourneyEvents = pgTable('driver_journey_events', {
  id: uuid('id').primaryKey().defaultRandom(),
  observationId: uuid('observation_id').notNull().references(() => driverJourneyObservations.id, { onDelete: 'cascade' }),
  eventKey: text('event_key').notNull().unique(),
  kind: text('kind').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  readAt: timestamp('read_at', { withTimezone: true }),
  pushAttemptedAt: timestamp('push_attempted_at', { withTimezone: true }),
  pushClaimedUntil: timestamp('push_claimed_until', { withTimezone: true }),
  pushAttempts: integer('push_attempts').notNull().default(0),
  pushAcceptedAt: timestamp('push_accepted_at', { withTimezone: true }),
}, (table) => [index('driver_journey_events_created_idx').on(table.createdAt)]);
