-- Local PAYE payment evidence, not a bank integration or HMRC submission.
-- UK tax months are selected by payroll payment date, from the 6th to the 5th.
-- Source: https://www.gov.uk/pay-paye-tax (verified 2026-10-21).
-- Adds evidence tables and a review hash; extends existing payroll checks.
-- Does not update existing tax, payroll, booking or customer records.

DO $$
BEGIN
  IF to_regclass('payroll_run_finalised_results') IS NULL OR to_regclass('payroll_runs') IS NULL THEN
    RAISE EXCEPTION 'Payroll monthly liabilities require migrations 0026, 0027 and 0028 before 0032';
  END IF;
END $$;

-- Phase 2A only allowed drafts. Enable the reviewed/finalised lifecycle before
-- writing immutable results; this extends the constraint without changing rows.
ALTER TABLE "payroll_runs" DROP CONSTRAINT IF EXISTS "payroll_runs_status_check";
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_status_check"
  CHECK ("run_status" IN ('draft', 'submitted_for_review', 'approved', 'finalised', 'cancelled'));

-- Bind approval to the exact calculated inputs; existing reviews remain unknown.
ALTER TABLE "tax_reviews" ADD COLUMN IF NOT EXISTS "calculation_input_hash" varchar(64);

ALTER TABLE "payroll_employee_starter_data" DROP CONSTRAINT IF EXISTS "payroll_employee_starter_source_check";
ALTER TABLE "payroll_employee_starter_data" ADD CONSTRAINT "payroll_employee_starter_source_check"
  CHECK ("source_type" IN ('p45', 'starter_checklist', 'none_confirmed', 'first_payroll_this_tax_year', 'current_employment_opening'));

CREATE TABLE IF NOT EXISTS "payroll_hmrc_payments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "period_start" date NOT NULL,
  "amount_pence" integer NOT NULL,
  "paid_on" date NOT NULL,
  "reference" varchar(120) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "recorded_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "voided_at" timestamp with time zone,
  "void_reason" varchar(500),
  "voided_by_user_id" uuid REFERENCES "users" ("id") ON DELETE RESTRICT,
  "void_idempotency_key" varchar(128),
  "void_payload_hash" varchar(64),
  CONSTRAINT "payroll_hmrc_payments_positive_amount" CHECK (amount_pence > 0 AND amount_pence <= 2000000000),
  CONSTRAINT "payroll_hmrc_payments_tax_month_start" CHECK (EXTRACT(DAY FROM period_start) = 6)
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_payments_company_key_unique"
  ON "payroll_hmrc_payments" ("company_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_payments_receipt_unique"
  ON "payroll_hmrc_payments" ("company_id", "paid_on", lower(btrim("reference")), "amount_pence") WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_payments_void_key_unique"
  ON "payroll_hmrc_payments" ("company_id", "void_idempotency_key");
CREATE INDEX IF NOT EXISTS "payroll_hmrc_payments_company_period_idx"
  ON "payroll_hmrc_payments" ("company_id", "period_start");

CREATE TABLE IF NOT EXISTS "payroll_hmrc_adjustments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "period_start" date NOT NULL,
  "amount_pence" integer NOT NULL,
  "reason" varchar(500) NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "payload_hash" varchar(64) NOT NULL,
  "recorded_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "voided_at" timestamp with time zone,
  "void_reason" varchar(500),
  "voided_by_user_id" uuid REFERENCES "users" ("id") ON DELETE RESTRICT,
  "void_idempotency_key" varchar(128),
  "void_payload_hash" varchar(64),
  CONSTRAINT "payroll_hmrc_adjustments_nonzero_amount" CHECK (amount_pence <> 0 AND amount_pence BETWEEN -2000000000 AND 2000000000),
  CONSTRAINT "payroll_hmrc_adjustments_tax_month_start" CHECK (EXTRACT(DAY FROM period_start) = 6)
);
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_adjustments_company_key_unique"
  ON "payroll_hmrc_adjustments" ("company_id", "idempotency_key");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_adjustments_evidence_unique"
  ON "payroll_hmrc_adjustments" ("company_id", "period_start", "amount_pence", lower(btrim("reason"))) WHERE voided_at IS NULL;
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_hmrc_adjustments_void_key_unique"
  ON "payroll_hmrc_adjustments" ("company_id", "void_idempotency_key");
CREATE INDEX IF NOT EXISTS "payroll_hmrc_adjustments_company_period_idx"
  ON "payroll_hmrc_adjustments" ("company_id", "period_start");
