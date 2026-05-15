ALTER TABLE "admin_quote_drafts" ADD COLUMN "confirmed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "admin_quote_drafts" ADD COLUMN "confirmation_method" text;--> statement-breakpoint
ALTER TABLE "admin_quote_drafts" ADD COLUMN "selected_payment_option" text;
