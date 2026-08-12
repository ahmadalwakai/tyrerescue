CREATE TYPE "stock_city_role" AS ENUM ('viewer', 'operator', 'manager');
CREATE TYPE "stock_shift_status" AS ENUM ('active', 'ended', 'void');
CREATE TYPE "stock_movement_type" AS ENUM ('RECEIVED', 'SALE', 'SALE_REVERSAL', 'RETURN', 'DAMAGED', 'CORRECTION');
CREATE TYPE "stock_sale_channel" AS ENUM ('GARAGE', 'EMERGENCY_CALL_OUT');

CREATE TABLE "stock_cities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "slug" varchar(100) NOT NULL,
  "name" varchar(120) NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "stock_cities_slug_unique" UNIQUE("slug")
);

CREATE TABLE "stock_user_city_access" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "city_id" uuid NOT NULL,
  "role_in_city" "stock_city_role" DEFAULT 'operator' NOT NULL,
  "is_active" boolean DEFAULT true NOT NULL,
  "created_by_user_id" uuid,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE TABLE "stock_shifts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "user_id" uuid NOT NULL,
  "city_id" uuid NOT NULL,
  "started_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "ended_at" timestamp with time zone,
  "status" "stock_shift_status" DEFAULT 'active' NOT NULL,
  "ended_by_user_id" uuid,
  "admin_override_reason" text,
  "idempotency_key" varchar(200),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "stock_shifts_idempotency_key_unique" UNIQUE("idempotency_key")
);

CREATE TABLE "stock_inventory_balances" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id" uuid NOT NULL,
  "tyre_product_id" uuid NOT NULL,
  "current_stock" integer DEFAULT 0 NOT NULL,
  "reserved_stock" integer DEFAULT 0 NOT NULL,
  "ordered_stock" integer DEFAULT 0 NOT NULL,
  "min_stock" integer DEFAULT 0 NOT NULL,
  "target_stock" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "stock_inventory_balances_current_stock_nonnegative" CHECK ("current_stock" >= 0),
  CONSTRAINT "stock_inventory_balances_reserved_stock_nonnegative" CHECK ("reserved_stock" >= 0),
  CONSTRAINT "stock_inventory_balances_ordered_stock_nonnegative" CHECK ("ordered_stock" >= 0),
  CONSTRAINT "stock_inventory_balances_min_stock_nonnegative" CHECK ("min_stock" >= 0),
  CONSTRAINT "stock_inventory_balances_target_stock_nonnegative" CHECK ("target_stock" >= 0)
);

ALTER TABLE "bookings" ADD COLUMN "stock_city_id" uuid;
ALTER TABLE "bookings" ADD COLUMN "stock_city_locked_at" timestamp with time zone;

CREATE TABLE "stock_reservations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id" uuid NOT NULL,
  "tyre_product_id" uuid NOT NULL,
  "booking_id" uuid,
  "quantity" integer NOT NULL,
  "expires_at" timestamp with time zone NOT NULL,
  "released" boolean DEFAULT false NOT NULL,
  "released_at" timestamp with time zone,
  "idempotency_key" varchar(200),
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "stock_reservations_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "stock_reservations_quantity_positive" CHECK ("quantity" > 0)
);

CREATE TABLE "stock_movements" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id" uuid NOT NULL,
  "tyre_product_id" uuid NOT NULL,
  "movement_type" "stock_movement_type" NOT NULL,
  "quantity_delta" integer NOT NULL,
  "previous_balance" integer NOT NULL,
  "resulting_balance" integer NOT NULL,
  "actor_user_id" uuid,
  "shift_id" uuid,
  "booking_id" uuid,
  "sale_channel" "stock_sale_channel",
  "reverses_movement_id" uuid,
  "idempotency_key" varchar(200),
  "reason" text,
  "note" text,
  "metadata" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "occurred_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  CONSTRAINT "stock_movements_idempotency_key_unique" UNIQUE("idempotency_key"),
  CONSTRAINT "stock_movements_quantity_delta_nonzero" CHECK ("quantity_delta" <> 0),
  CONSTRAINT "stock_movements_previous_balance_nonnegative" CHECK ("previous_balance" >= 0),
  CONSTRAINT "stock_movements_resulting_balance_nonnegative" CHECK ("resulting_balance" >= 0)
);

CREATE TABLE "missing_tyre_requests" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "city_id" uuid NOT NULL,
  "normalized_size" varchar(32) NOT NULL,
  "requester_user_id" uuid,
  "shift_id" uuid,
  "booking_id" uuid,
  "sale_channel" "stock_sale_channel",
  "context" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

ALTER TABLE "stock_cities" ADD CONSTRAINT "stock_cities_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_user_city_access" ADD CONSTRAINT "stock_user_city_access_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_user_city_access" ADD CONSTRAINT "stock_user_city_access_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_user_city_access" ADD CONSTRAINT "stock_user_city_access_created_by_user_id_users_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_shifts" ADD CONSTRAINT "stock_shifts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_shifts" ADD CONSTRAINT "stock_shifts_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_shifts" ADD CONSTRAINT "stock_shifts_ended_by_user_id_users_id_fk" FOREIGN KEY ("ended_by_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_inventory_balances" ADD CONSTRAINT "stock_inventory_balances_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_inventory_balances" ADD CONSTRAINT "stock_inventory_balances_tyre_product_id_tyre_products_id_fk" FOREIGN KEY ("tyre_product_id") REFERENCES "public"."tyre_products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "bookings" ADD CONSTRAINT "bookings_stock_city_id_stock_cities_id_fk" FOREIGN KEY ("stock_city_id") REFERENCES "public"."stock_cities"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_tyre_product_id_tyre_products_id_fk" FOREIGN KEY ("tyre_product_id") REFERENCES "public"."tyre_products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_reservations" ADD CONSTRAINT "stock_reservations_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_tyre_product_id_tyre_products_id_fk" FOREIGN KEY ("tyre_product_id") REFERENCES "public"."tyre_products"("id") ON DELETE restrict ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_user_id_users_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_shift_id_stock_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."stock_shifts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reverses_movement_id_stock_movements_id_fk" FOREIGN KEY ("reverses_movement_id") REFERENCES "public"."stock_movements"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "missing_tyre_requests" ADD CONSTRAINT "missing_tyre_requests_city_id_stock_cities_id_fk" FOREIGN KEY ("city_id") REFERENCES "public"."stock_cities"("id") ON DELETE cascade ON UPDATE no action;
ALTER TABLE "missing_tyre_requests" ADD CONSTRAINT "missing_tyre_requests_requester_user_id_users_id_fk" FOREIGN KEY ("requester_user_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "missing_tyre_requests" ADD CONSTRAINT "missing_tyre_requests_shift_id_stock_shifts_id_fk" FOREIGN KEY ("shift_id") REFERENCES "public"."stock_shifts"("id") ON DELETE no action ON UPDATE no action;
ALTER TABLE "missing_tyre_requests" ADD CONSTRAINT "missing_tyre_requests_booking_id_bookings_id_fk" FOREIGN KEY ("booking_id") REFERENCES "public"."bookings"("id") ON DELETE no action ON UPDATE no action;

CREATE INDEX "stock_cities_active_idx" ON "stock_cities" ("is_active");
CREATE UNIQUE INDEX "stock_user_city_access_user_city_unique" ON "stock_user_city_access" ("user_id", "city_id");
CREATE INDEX "stock_user_city_access_user_idx" ON "stock_user_city_access" ("user_id");
CREATE INDEX "stock_user_city_access_city_idx" ON "stock_user_city_access" ("city_id");
CREATE UNIQUE INDEX "stock_shifts_one_active_per_user_idx" ON "stock_shifts" ("user_id") WHERE "ended_at" IS NULL;
CREATE INDEX "stock_shifts_city_started_idx" ON "stock_shifts" ("city_id", "started_at");
CREATE INDEX "stock_shifts_user_started_idx" ON "stock_shifts" ("user_id", "started_at");
CREATE UNIQUE INDEX "stock_inventory_balances_city_product_unique" ON "stock_inventory_balances" ("city_id", "tyre_product_id");
CREATE INDEX "stock_inventory_balances_city_idx" ON "stock_inventory_balances" ("city_id");
CREATE INDEX "stock_inventory_balances_product_idx" ON "stock_inventory_balances" ("tyre_product_id");
CREATE INDEX "stock_reservations_city_product_expires_idx" ON "stock_reservations" ("city_id", "tyre_product_id", "expires_at");
CREATE INDEX "stock_reservations_booking_idx" ON "stock_reservations" ("booking_id");
CREATE UNIQUE INDEX "stock_movements_reverses_unique_idx" ON "stock_movements" ("reverses_movement_id") WHERE "reverses_movement_id" IS NOT NULL;
CREATE INDEX "stock_movements_city_product_occurred_idx" ON "stock_movements" ("city_id", "tyre_product_id", "occurred_at");
CREATE INDEX "stock_movements_booking_idx" ON "stock_movements" ("booking_id");
CREATE INDEX "stock_movements_shift_idx" ON "stock_movements" ("shift_id");
CREATE INDEX "missing_tyre_requests_city_size_created_idx" ON "missing_tyre_requests" ("city_id", "normalized_size", "created_at");
CREATE INDEX "missing_tyre_requests_booking_idx" ON "missing_tyre_requests" ("booking_id");
CREATE INDEX "missing_tyre_requests_shift_idx" ON "missing_tyre_requests" ("shift_id");
