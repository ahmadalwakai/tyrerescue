ALTER TABLE "quick_bookings" ADD COLUMN "price_breakdown" jsonb;
ALTER TABLE "quick_bookings" ADD COLUMN "admin_adjustment_amount" decimal(10, 2) DEFAULT '0.00';
ALTER TABLE "quick_bookings" ADD COLUMN "admin_adjustment_reason" text;
