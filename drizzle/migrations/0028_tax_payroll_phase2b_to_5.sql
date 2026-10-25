-- Tax & Payroll Phase 2B–5:
-- Payroll finalisation, review/approval workflow, pension enrolment records,
-- double-entry ledger, VAT returns, Corporation Tax periods,
-- RTI FPS/EPS drafts, document storage, and in-app notifications.
--
-- Sources (all retrieved 2026-10-13):
--   https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027
--   https://www.gov.uk/guidance/real-time-information-for-paye
--   https://www.gov.uk/vat-returns/send-your-return
--   https://www.gov.uk/corporation-tax-rates
--   The Pensions Regulator auto-enrolment thresholds 2026-27
--
-- All existing tables are only extended with nullable columns.
-- No existing rows are modified.
-- No production submissions to HMRC are enabled by this migration.

-- ─── payroll_settings extensions (Phase 2B) ──────────────────────────────────

ALTER TABLE "payroll_settings"
  ADD COLUMN IF NOT EXISTS "paye_reference" varchar(20),
  ADD COLUMN IF NOT EXISTS "accounts_office_ref" varchar(25),
  ADD COLUMN IF NOT EXISTS "employer_pension_scheme_ref" varchar(50),
  ADD COLUMN IF NOT EXISTS "pension_provider_name" varchar(200),
  ADD COLUMN IF NOT EXISTS "employee_pension_rate" numeric(6, 4),    -- e.g. 0.0500
  ADD COLUMN IF NOT EXISTS "employer_pension_rate" numeric(6, 4),    -- e.g. 0.0300
  ADD COLUMN IF NOT EXISTS "pension_contribution_basis" text;        -- qualifying_earnings | pensionable_pay | salary_sacrifice

-- ─── payroll_run_lines extensions (Phase 2B) ─────────────────────────────────

ALTER TABLE "payroll_run_lines"
  ADD COLUMN IF NOT EXISTS "resolved_hourly_rate" numeric(10, 4);   -- effective rate at entry time (from pay terms)

-- ─── payroll_run_finalised_results (Phase 2B) ────────────────────────────────
-- Immutable store of the calculated result for each employee in a finalised run.
-- Written once on finalisation; never updated.

CREATE TABLE IF NOT EXISTS "payroll_run_finalised_results" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL REFERENCES "payroll_runs" ("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "employee_id" uuid NOT NULL REFERENCES "payroll_employees" ("id") ON DELETE RESTRICT,
  "tax_year" varchar(9) NOT NULL,
  "period_number" integer NOT NULL,
  "gross_pay_pence" integer NOT NULL,
  "tax_for_period_pence" integer NOT NULL,
  "employee_ni_pence" integer NOT NULL,
  "employer_ni_pence" integer NOT NULL,
  "student_loan_pence" integer NOT NULL DEFAULT 0,
  "pension_employee_pence" integer NOT NULL DEFAULT 0,
  "pension_employer_pence" integer NOT NULL DEFAULT 0,
  "net_pay_pence" integer NOT NULL,
  "total_deductions_pence" integer NOT NULL,
  "tax_code" varchar(20) NOT NULL,
  "ni_category" varchar(5) NOT NULL,
  "calculation_status" text NOT NULL,
  "warnings" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "ytd_snapshot" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "payroll_run_finalised_results_run_idx"
  ON "payroll_run_finalised_results" ("run_id");
CREATE UNIQUE INDEX IF NOT EXISTS "payroll_run_finalised_results_run_emp_unique"
  ON "payroll_run_finalised_results" ("run_id", "employee_id");

-- ─── tax_reviews (Phase 2B) ───────────────────────────────────────────────────
-- Review / approval records for payroll runs and tax returns.
-- Self-review is prohibited at the application layer.

CREATE TABLE IF NOT EXISTS "tax_reviews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE CASCADE,
  "entity_type" text NOT NULL,          -- payroll_run | vat_return | corporation_tax_return
  "entity_id" uuid NOT NULL,
  "submitted_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "reviewed_by_user_id" uuid REFERENCES "users" ("id") ON DELETE RESTRICT,
  "status" text NOT NULL DEFAULT 'pending',   -- pending | approved | rejected
  "notes" text,
  "submitted_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "reviewed_at" timestamp with time zone,
  "updated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "version" integer NOT NULL DEFAULT 1
);

CREATE INDEX IF NOT EXISTS "tax_reviews_company_entity_idx"
  ON "tax_reviews" ("company_id", "entity_id");
CREATE INDEX IF NOT EXISTS "tax_reviews_company_status_idx"
  ON "tax_reviews" ("company_id", "status");

-- ─── payroll_employee_enrolments (Phase 2B) ───────────────────────────────────
-- Pension auto-enrolment assessment records per employee.

CREATE TABLE IF NOT EXISTS "payroll_employee_enrolments" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "employee_id" uuid NOT NULL REFERENCES "payroll_employees" ("id") ON DELETE RESTRICT,
  "enrolment_status" text NOT NULL DEFAULT 'not_assessed',
  -- not_assessed | enrolled | opted_out | postponed | ceased
  "worker_category" text,               -- eligible_jobholder | non_eligible_jobholder | entitled_worker
  "enrolment_date" date,
  "opt_out_date" date,
  "opt_out_window_ends" date,
  "cessation_date" date,
  "last_assessment_date" date,
  "last_assessment_annualised_earnings_pence" integer,
  "thresholds_version" varchar(10),     -- '2026-27'
  "recorded_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_employee_enrolments_company_emp_unique"
  ON "payroll_employee_enrolments" ("company_id", "employee_id");

-- ─── ledger_accounts (Phase 3A) ───────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "ledger_accounts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE CASCADE,
  "code" varchar(20) NOT NULL,
  "name" varchar(200) NOT NULL,
  "account_type" text NOT NULL,         -- asset | liability | equity | revenue | expense
  "normal_balance" text NOT NULL,       -- debit | credit
  "parent_code" varchar(20),
  "is_system_account" boolean NOT NULL DEFAULT false,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "ledger_accounts_company_code_unique"
  ON "ledger_accounts" ("company_id", "code");

-- ─── journal_entries (Phase 3A) ───────────────────────────────────────────────
-- Header record for each posted journal. Immutable once posted.

CREATE TABLE IF NOT EXISTS "journal_entries" (
  "id" uuid PRIMARY KEY NOT NULL,       -- supplied by application (not gen_random_uuid)
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "reference" text NOT NULL,            -- source document ID
  "reference_type" text NOT NULL,       -- payroll_run | vat_return | corporation_tax | bank_import | manual
  "transaction_date" date NOT NULL,
  "narration" text NOT NULL,
  "posted_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "posted_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "journal_entries_company_date_idx"
  ON "journal_entries" ("company_id", "transaction_date");
CREATE INDEX IF NOT EXISTS "journal_entries_reference_idx"
  ON "journal_entries" ("company_id", "reference");

-- ─── journal_lines (Phase 3A) ─────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "journal_lines" (
  "id" uuid PRIMARY KEY NOT NULL,
  "journal_id" uuid NOT NULL REFERENCES "journal_entries" ("id") ON DELETE CASCADE,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "account_id" uuid NOT NULL REFERENCES "ledger_accounts" ("id") ON DELETE RESTRICT,
  "account_code" varchar(20) NOT NULL,  -- denormalised for reporting
  "debit_pence" integer NOT NULL DEFAULT 0,
  "credit_pence" integer NOT NULL DEFAULT 0,
  "narration" text
);

CREATE INDEX IF NOT EXISTS "journal_lines_journal_idx"
  ON "journal_lines" ("journal_id");
CREATE INDEX IF NOT EXISTS "journal_lines_account_idx"
  ON "journal_lines" ("company_id", "account_id");

-- Enforce that every line has at least one non-zero value
ALTER TABLE "journal_lines"
  ADD CONSTRAINT "journal_lines_nonzero"
  CHECK ("debit_pence" > 0 OR "credit_pence" > 0);

-- ─── vat_periods (Phase 3B) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vat_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "period_key" varchar(10) NOT NULL,    -- HMRC period key e.g. "23AA"
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "due_date" date NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  -- open | draft_calculated | submitted | acknowledged | overdue
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "vat_periods_company_period_key_unique"
  ON "vat_periods" ("company_id", "period_key");

-- ─── vat_returns (Phase 3B) ───────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "vat_returns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "period_id" uuid NOT NULL REFERENCES "vat_periods" ("id") ON DELETE RESTRICT,
  "period_key" varchar(10) NOT NULL,
  -- Box values in pence
  "box1_output_tax_pence" integer NOT NULL DEFAULT 0,
  "box2_acquisition_tax_pence" integer NOT NULL DEFAULT 0,
  "box3_total_output_pence" integer NOT NULL DEFAULT 0,
  "box4_input_tax_claimed_pence" integer NOT NULL DEFAULT 0,
  "box5_net_vat_payable_pence" integer NOT NULL,    -- can be negative (refund)
  "box6_total_sales_net_pence" integer NOT NULL DEFAULT 0,
  "box7_total_purchases_net_pence" integer NOT NULL DEFAULT 0,
  "box8_goods_supplied_net_pence" integer NOT NULL DEFAULT 0,
  "box9_goods_acquired_net_pence" integer NOT NULL DEFAULT 0,
  "transaction_count" integer NOT NULL DEFAULT 0,
  "status" text NOT NULL DEFAULT 'draft',           -- draft | submitted | acknowledged
  "submitted_at" timestamp with time zone,
  "submission_correlation_id" varchar(100),
  "calculated_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "vat_returns_company_period_unique"
  ON "vat_returns" ("company_id", "period_id");

-- ─── corporation_tax_periods (Phase 5) ────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "corporation_tax_periods" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "status" text NOT NULL DEFAULT 'open',
  -- open | draft_calculated | submitted | acknowledged
  "trading_profits_pence" integer NOT NULL DEFAULT 0,
  "non_trading_income_pence" integer NOT NULL DEFAULT 0,
  "chargeable_gains_pence" integer NOT NULL DEFAULT 0,
  "exempt_distributions_pence" integer NOT NULL DEFAULT 0,
  "associated_companies" integer NOT NULL DEFAULT 0,
  "taxable_total_profits_pence" integer NOT NULL DEFAULT 0,
  "net_ct_payable_pence" integer NOT NULL DEFAULT 0,
  "marginal_relief_pence" integer NOT NULL DEFAULT 0,
  "main_rate_tax_pence" integer NOT NULL DEFAULT 0,
  "rate_applied" text,                  -- small_profits | main | marginal_relief
  "effective_rate_bps" integer,         -- basis points e.g. 1900 = 19.00%
  "ct600_boxes" jsonb DEFAULT '{}'::jsonb,
  "calculated_by_user_id" uuid REFERENCES "users" ("id") ON DELETE RESTRICT,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "corporation_tax_periods_company_start_unique"
  ON "corporation_tax_periods" ("company_id", "period_start");

-- ─── rti_submissions (Phase 4) ────────────────────────────────────────────────
-- FPS and EPS draft records. XML payload stored for audit.
-- No real HMRC submissions in this phase.

CREATE TABLE IF NOT EXISTS "rti_submissions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE RESTRICT,
  "submission_type" text NOT NULL,      -- FPS | EPS
  "tax_year" varchar(9) NOT NULL,
  "tax_month" integer,
  "payment_date" date,
  "run_id" uuid REFERENCES "payroll_runs" ("id") ON DELETE SET NULL,
  "status" text NOT NULL DEFAULT 'draft',
  "xml_payload_hash" varchar(64),       -- SHA-256 of xml_payload
  "xml_payload" text,                   -- draft XML (not yet submitted)
  "employee_count" integer NOT NULL DEFAULT 0,
  "validation_warnings" jsonb DEFAULT '[]'::jsonb,
  "submitted_at" timestamp with time zone,
  "correlation_id" varchar(100),
  "created_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT,
  "version" integer NOT NULL DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT NOW() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS "rti_submissions_company_type_idx"
  ON "rti_submissions" ("company_id", "submission_type", "created_at");
CREATE INDEX IF NOT EXISTS "rti_submissions_run_idx"
  ON "rti_submissions" ("run_id");

-- ─── tax_documents (Phases 2B–5) ──────────────────────────────────────────────
-- Binary document storage for payslips, P60, VAT return PDFs, CT drafts.
-- contentBlob stores up to 10MB per document.

CREATE TABLE IF NOT EXISTS "tax_documents" (
  "id" uuid PRIMARY KEY NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  -- payslip | p60 | p45 | p11d | vat_return_draft | ct600_draft | fps_draft | eps_draft
  "entity_id" uuid NOT NULL,            -- payroll_run_id | employee_id | vat_period_id | ct_period_id
  "filename" varchar(200) NOT NULL,
  "mime_type" varchar(100) NOT NULL,
  "content_hash" varchar(64) NOT NULL,  -- SHA-256 of content bytes
  "size_bytes" integer NOT NULL,
  "content_blob" bytea NOT NULL,
  "metadata" jsonb NOT NULL DEFAULT '{}'::jsonb,
  "generated_at" timestamp with time zone NOT NULL DEFAULT NOW(),
  "generated_by_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "tax_documents_company_entity_idx"
  ON "tax_documents" ("company_id", "entity_id");
CREATE UNIQUE INDEX IF NOT EXISTS "tax_documents_company_hash_unique"
  ON "tax_documents" ("company_id", "content_hash");

-- ─── tax_notifications (Phases 2B–5) ─────────────────────────────────────────
-- In-app notifications only. No SMS/email/push in this phase.

CREATE TABLE IF NOT EXISTS "tax_notifications" (
  "id" uuid PRIMARY KEY NOT NULL,
  "company_id" uuid NOT NULL REFERENCES "tax_company_entities" ("id") ON DELETE CASCADE,
  "recipient_user_id" uuid NOT NULL REFERENCES "users" ("id") ON DELETE CASCADE,
  "kind" text NOT NULL,
  "severity" text NOT NULL DEFAULT 'info',  -- info | warning | action_required
  "title" varchar(200) NOT NULL,
  "body" text NOT NULL,
  "entity_type" text,
  "entity_id" uuid,
  "read_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS "tax_notifications_recipient_idx"
  ON "tax_notifications" ("company_id", "recipient_user_id", "created_at");
CREATE INDEX IF NOT EXISTS "tax_notifications_unread_idx"
  ON "tax_notifications" ("company_id", "recipient_user_id")
  WHERE "read_at" IS NULL;
