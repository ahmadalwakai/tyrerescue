import {
  pgTable,
  pgEnum,
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
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { QuoteTyreSelectionSnapshot } from '@/lib/quote-snapshot';

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

// Bookings table
export const bookings = pgTable('bookings', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  refNumber: varchar('ref_number', { length: 20 }).unique().notNull(),
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
  quoteExpiresAt: timestamp('quote_expires_at', { withTimezone: true }),
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

// Booking conversations (one per booking per channel)
export const bookingConversations = pgTable('booking_conversations', {
  id: uuid('id').primaryKey().default(sql`gen_random_uuid()`),
  bookingId: uuid('booking_id').references(() => bookings.id, { onDelete: 'cascade' }).notNull(),
  channel: text('channel').notNull(), // 'customer_admin' | 'customer_driver'
  status: text('status').notNull().default('open'), // open | closed | archived
  locked: boolean('locked').default(false),
  muted: boolean('muted').default(false),
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
  updatedAt: timestamp('updated_at', { withTimezone: true }).default(sql`NOW()`),
});

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
  senderId: uuid('sender_id').references(() => users.id).notNull(),
  senderRole: text('sender_role').notNull(), // 'customer' | 'admin' | 'driver'
  body: text('body'),
  messageType: text('message_type').notNull().default('text'), // 'text' | 'image' | 'admin_note'
  deliveryStatus: text('delivery_status').notNull().default('sent'), // 'sending' | 'sent' | 'delivered' | 'failed'
  createdAt: timestamp('created_at', { withTimezone: true }).default(sql`NOW()`),
});

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
});

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
  serviceType: text('service_type').notNull(), // 'fit' | 'repair' | 'assess'
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

// Type exports for use throughout the application
export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
export type Driver = typeof drivers.$inferSelect;
export type NewDriver = typeof drivers.$inferInsert;
export type TyreCatalogueItem = typeof tyreCatalogue.$inferSelect;
export type NewTyreCatalogueItem = typeof tyreCatalogue.$inferInsert;
export type TyreProduct = typeof tyreProducts.$inferSelect;
export type NewTyreProduct = typeof tyreProducts.$inferInsert;
export type Booking = typeof bookings.$inferSelect;
export type NewBooking = typeof bookings.$inferInsert;
export type BookingTyre = typeof bookingTyres.$inferSelect;
export type NewBookingTyre = typeof bookingTyres.$inferInsert;
export type Invoice = typeof invoices.$inferSelect;
export type NewInvoice = typeof invoices.$inferInsert;
export type InvoiceItem = typeof invoiceItems.$inferSelect;
export type HomepageMedia = typeof homepageMedia.$inferSelect;
export type NewHomepageMedia = typeof homepageMedia.$inferInsert;
export type NewInvoiceItem = typeof invoiceItems.$inferInsert;
export type BookingStatusHistory = typeof bookingStatusHistory.$inferSelect;
export type InventoryReservation = typeof inventoryReservations.$inferSelect;
export type InventoryMovement = typeof inventoryMovements.$inferSelect;
export type Payment = typeof payments.$inferSelect;
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
export type PricingConfig = typeof pricingConfig.$inferSelect;
export type NewPricingConfig = typeof pricingConfig.$inferInsert;
export type QuickBooking = typeof quickBookings.$inferSelect;
export type NewQuickBooking = typeof quickBookings.$inferInsert;
export type DemandSnapshot = typeof demandSnapshots.$inferSelect;
export type NewDemandSnapshot = typeof demandSnapshots.$inferInsert;
export type DriverNotification = typeof driverNotifications.$inferSelect;
export type NewDriverNotification = typeof driverNotifications.$inferInsert;
export type DriverSoundSetting = typeof driverSoundSettings.$inferSelect;
export type NewDriverSoundSetting = typeof driverSoundSettings.$inferInsert;
export type DriverSoundAsset = typeof driverSoundAssets.$inferSelect;
export type NewDriverSoundAsset = typeof driverSoundAssets.$inferInsert;
