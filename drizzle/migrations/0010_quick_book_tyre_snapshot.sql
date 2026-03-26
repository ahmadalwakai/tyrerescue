ALTER TABLE "quick_bookings"
  ADD COLUMN IF NOT EXISTS "selected_tyre_product_id" uuid REFERENCES "tyre_products"("id");

ALTER TABLE "quick_bookings"
  ADD COLUMN IF NOT EXISTS "selected_tyre_unit_price" decimal(10, 2);

ALTER TABLE "quick_bookings"
  ADD COLUMN IF NOT EXISTS "selected_tyre_brand" varchar(100);

ALTER TABLE "quick_bookings"
  ADD COLUMN IF NOT EXISTS "selected_tyre_pattern" varchar(200);
