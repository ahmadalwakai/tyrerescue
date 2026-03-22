ALTER TABLE "bookings" ADD COLUMN "utm_source" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_medium" varchar(100);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_campaign" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_term" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "utm_content" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "gclid" varchar(255);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "landing_page" varchar(500);--> statement-breakpoint
ALTER TABLE "bookings" ADD COLUMN "referrer" varchar(500);