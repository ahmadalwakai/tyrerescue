-- Tax & Payroll Phase 2A: employees, pay terms, payroll settings,
-- draft pay runs, gross-pay previews, and idempotency records.
--
-- Data references:
--   https://www.gov.uk/new-employee/employee-information (checked 2026-10-13)
--   https://www.gov.uk/guidance/what-payroll-information-to-report-to-hmrc (checked 2026-10-13)
--   https://www.gov.uk/guidance/special-rules-for-student-loans (checked 2026-10-13)
--   https://www.gov.uk/guidance/rates-and-thresholds-for-employers-2026-to-2027 (checked 2026-10-13)
--
-- No existing table is altered. All additions are additive.
-- NINO is stored encrypted; plaintext never appears in DB, logs, or errors.

-- ─── Payroll employees ────────────────────────────────────────────────────────
-- One row per employment relationship. A rehire creates a new row, never
-- overwrites the previous record. Internal identifier is separate from any
-- HMRC payroll ID. employee_reference is optional but unique within company.

CREATE TABLE IF NOT EXISTS "payroll_employees" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  -- Identity
  "legal_first_name" varchar(100) NOT NULL,
  "legal_surname" varchar(100) NOT NULL,
  "employee_reference" varchar(50),              -- optional company-assigned ref
  -- Employment
  "employment_start_date" date NOT NULL,
  "employment_end_date" date,
  "is_director" boolean DEFAULT false NOT NULL,
  -- Status
  "employee_status" text DEFAULT 'active' NOT NULL, -- active | left | suspended
  -- Optional declared info (all nullable — never invented)
  "date_of_birth" date,
  "address_line1" text,
  "address_line2" text,
  "address_city" varchar(120),
  "address_postcode" varchar(10),
  -- Tax / HMRC (supplied only; never derived by the application)
  "tax_code" varchar(20),
  "tax_code_basis" text,                         -- cumulative | week1_month1
  "tax_code_effective_date" date,
  "tax_code_source" text,                        -- p45 | starter_checklist | hmrc_notification
  "ni_category" varchar(5),                      -- as declared; no default applied
  -- Optional link to app user (does not grant payroll self-access)
  "linked_user_id" uuid,
  -- Payroll identifier supplied when migrating from another system
  "payroll_id_migration_ref" varchar(100),
  -- OCC / audit
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_employees_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_employees_created_by_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_employees_linked_user_fk"
    FOREIGN KEY ("linked_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "payroll_employees_status_check"
    CHECK ("employee_status" IN ('active', 'left', 'suspended')),
  CONSTRAINT "payroll_employees_tax_code_basis_check"
    CHECK ("tax_code_basis" IS NULL OR "tax_code_basis" IN ('cumulative', 'week1_month1')),
  CONSTRAINT "payroll_employees_tax_code_source_check"
    CHECK ("tax_code_source" IS NULL OR "tax_code_source" IN ('p45', 'starter_checklist', 'hmrc_notification'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_employees_company_ref_unique"
  ON "payroll_employees" ("company_id", "employee_reference")
  WHERE "employee_reference" IS NOT NULL;
CREATE INDEX IF NOT EXISTS "payroll_employees_company_idx"
  ON "payroll_employees" ("company_id");
CREATE INDEX IF NOT EXISTS "payroll_employees_linked_user_idx"
  ON "payroll_employees" ("linked_user_id")
  WHERE "linked_user_id" IS NOT NULL;

-- Encrypted sensitive fields (NINO). Separate table keeps unencrypted columns
-- outside of query paths that don't need sensitive data.
CREATE TABLE IF NOT EXISTS "payroll_employee_sensitive" (
  "employee_id" uuid PRIMARY KEY NOT NULL,
  "nino_encrypted" text,                         -- enc:v1:... format; NULL if not supplied
  "nino_key_version" varchar(20),
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_by_user_id" uuid NOT NULL,
  CONSTRAINT "payroll_employee_sensitive_employee_fk"
    FOREIGN KEY ("employee_id") REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_employee_sensitive_user_fk"
    FOREIGN KEY ("updated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

-- Starter checklist / P45 information. Separate from opening YTD.
CREATE TABLE IF NOT EXISTS "payroll_employee_starter_data" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "source_type" text NOT NULL,                   -- p45 | starter_checklist | none_confirmed
  "source_reference" text,
  -- P45 fields (from previous employer)
  "p45_leaving_date" date,
  "p45_total_pay_prev_employment" decimal(13, 4),
  "p45_total_tax_prev_employment" decimal(13, 4),
  "p45_tax_code" varchar(20),
  "p45_week1_month1" boolean,
  -- Starter checklist statement (A, B, or C — stored as supplied)
  "starter_declaration" varchar(1),              -- A | B | C
  -- Student loan declarations (array of plan codes; multiple plans allowed)
  "student_loan_plans" jsonb DEFAULT '[]'::jsonb NOT NULL, -- ["plan1","plan2","plan4","plan5"]
  "postgraduate_loan" boolean DEFAULT false NOT NULL,
  "student_loan_unknown" boolean DEFAULT false NOT NULL,   -- explicitly unknown vs no loan
  -- Current employment opening YTD (only when migrating mid-year; separate from P45)
  "opening_ytd_tax_year" varchar(9),             -- e.g. "2026-27"
  "opening_ytd_effective_date" date,
  "opening_ytd_gross_pay" decimal(13, 4),
  "opening_ytd_tax_paid" decimal(13, 4),
  "opening_ytd_ni_employee" decimal(13, 4),
  "opening_ytd_ni_employer" decimal(13, 4),
  "opening_ytd_student_loan_deductions" decimal(13, 4),
  "opening_ytd_pension_employee" decimal(13, 4),
  "opening_ytd_pension_employer" decimal(13, 4),
  "opening_ytd_completeness" text DEFAULT 'incomplete', -- incomplete | complete | verified
  -- Audit
  "recorded_by_user_id" uuid NOT NULL,
  "recorded_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_employee_starter_data_employee_fk"
    FOREIGN KEY ("employee_id") REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_employee_starter_data_user_fk"
    FOREIGN KEY ("recorded_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_employee_starter_source_check"
    CHECK ("source_type" IN ('p45', 'starter_checklist', 'none_confirmed'))
);

CREATE INDEX IF NOT EXISTS "payroll_employee_starter_data_employee_idx"
  ON "payroll_employee_starter_data" ("employee_id");

-- Employee record revisions
CREATE TABLE IF NOT EXISTS "payroll_employee_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,                     -- non-sensitive fields only
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changed_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_employee_revisions_employee_fk"
    FOREIGN KEY ("employee_id") REFERENCES "payroll_employees"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_employee_revisions_user_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_employee_revisions_emp_version_unique"
  ON "payroll_employee_revisions" ("employee_id", "version");
CREATE INDEX IF NOT EXISTS "payroll_employee_revisions_company_idx"
  ON "payroll_employee_revisions" ("company_id");

-- ─── Pay terms ────────────────────────────────────────────────────────────────
-- Effective-dated pay terms per employment. overlapping active periods are
-- prevented by the application layer (service-level check before insert).

CREATE TABLE IF NOT EXISTS "payroll_pay_terms" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "employee_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  -- Pay basis: exactly one of hourly_rate or fixed_period_gross must be set
  "pay_basis" text NOT NULL,                     -- hourly | fixed_period
  "hourly_rate" decimal(10, 4),                  -- GBP per hour; NULL for fixed_period
  "fixed_period_gross" decimal(13, 4),           -- GBP per period; NULL for hourly
  "currency" varchar(3) DEFAULT 'GBP' NOT NULL,
  -- Annual salary (supporting information only; NOT used for calculation)
  "annual_salary_note" decimal(13, 4),
  -- Schedule / period
  "pay_frequency" text NOT NULL,                 -- weekly | fortnightly | four_weekly | monthly
  "contracted_hours_per_week" decimal(6, 2),     -- optional
  -- Effective period (null end = currently active)
  "effective_from" date NOT NULL,
  "effective_to" date,
  -- Source / reference
  "source_note" text,
  -- OCC / audit
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_pay_terms_employee_fk"
    FOREIGN KEY ("employee_id") REFERENCES "payroll_employees"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_pay_terms_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_pay_terms_user_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_pay_terms_pay_basis_check"
    CHECK ("pay_basis" IN ('hourly', 'fixed_period')),
  CONSTRAINT "payroll_pay_terms_frequency_check"
    CHECK ("pay_frequency" IN ('weekly', 'fortnightly', 'four_weekly', 'monthly')),
  CONSTRAINT "payroll_pay_terms_hourly_xor_fixed_check"
    CHECK (
      ("pay_basis" = 'hourly'        AND "hourly_rate"       IS NOT NULL AND "fixed_period_gross" IS NULL)
      OR
      ("pay_basis" = 'fixed_period'  AND "fixed_period_gross" IS NOT NULL AND "hourly_rate"      IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "payroll_pay_terms_employee_effective_idx"
  ON "payroll_pay_terms" ("employee_id", "effective_from" DESC);
CREATE INDEX IF NOT EXISTS "payroll_pay_terms_company_idx"
  ON "payroll_pay_terms" ("company_id");

-- ─── Payroll settings ────────────────────────────────────────────────────────
-- One active record per company. Created on explicit activation only.

CREATE TABLE IF NOT EXISTS "payroll_settings" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid UNIQUE NOT NULL,
  "schedule_label" varchar(100) NOT NULL,
  "pay_frequency" text NOT NULL,                 -- weekly | fortnightly | four_weekly | monthly
  -- Schedule anchor: date of first payment (for weekly/fortnightly/four_weekly)
  "schedule_anchor_date" date,
  -- Monthly rule: day of month (1-28) or -1 for last working day
  "monthly_pay_day" smallint,
  "timezone" varchar(50) DEFAULT 'Europe/London' NOT NULL,
  -- OCC / audit
  "version" integer DEFAULT 1 NOT NULL,
  "activated_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_settings_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_settings_activated_by_fk"
    FOREIGN KEY ("activated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_settings_frequency_check"
    CHECK ("pay_frequency" IN ('weekly', 'fortnightly', 'four_weekly', 'monthly')),
  CONSTRAINT "payroll_settings_monthly_pay_day_check"
    CHECK ("monthly_pay_day" IS NULL OR ("monthly_pay_day" >= 1 AND "monthly_pay_day" <= 28) OR "monthly_pay_day" = -1)
);

CREATE TABLE IF NOT EXISTS "payroll_settings_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "settings_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changed_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_settings_revisions_settings_fk"
    FOREIGN KEY ("settings_id") REFERENCES "payroll_settings"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_settings_revisions_user_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "payroll_settings_revisions_settings_version_unique"
  ON "payroll_settings_revisions" ("settings_id", "version");

-- ─── Draft pay runs ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS "payroll_runs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "settings_id" uuid NOT NULL,
  "settings_version_at_creation" integer NOT NULL,
  "period_start" date NOT NULL,
  "period_end" date NOT NULL,
  "intended_payment_date" date NOT NULL,
  -- Lifecycle
  "run_status" text DEFAULT 'draft' NOT NULL,    -- draft | cancelled
  -- OCC / audit
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_runs_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_settings_fk"
    FOREIGN KEY ("settings_id") REFERENCES "payroll_settings"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_created_by_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_runs_status_check"
    CHECK ("run_status" IN ('draft', 'cancelled'))
);

CREATE INDEX IF NOT EXISTS "payroll_runs_company_idx"
  ON "payroll_runs" ("company_id", "created_at" DESC);

-- Earnings input lines per employee per run.
-- Each line represents one earnings element.
CREATE TABLE IF NOT EXISTS "payroll_run_lines" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  "employee_id" uuid NOT NULL,
  "pay_terms_id" uuid,                           -- FK to the applicable pay terms row
  "pay_terms_version_at_entry" integer,
  -- Line type
  "line_type" text NOT NULL,                     -- hours_worked | fixed_period | overtime | bonus | commission
  -- Hourly lines
  "worked_minutes" integer,                      -- integer minutes; NULL for fixed/bonus
  "hourly_rate_override" decimal(10, 4),         -- explicit override (NULL = use pay_terms rate)
  -- Fixed / bonus / commission
  "fixed_amount" decimal(13, 4),                 -- NULL for hourly lines
  -- Description / reference
  "description" text,
  -- Audit
  "entered_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_run_lines_run_fk"
    FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_run_lines_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_lines_employee_fk"
    FOREIGN KEY ("employee_id") REFERENCES "payroll_employees"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_lines_pay_terms_fk"
    FOREIGN KEY ("pay_terms_id") REFERENCES "payroll_pay_terms"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_lines_entered_by_fk"
    FOREIGN KEY ("entered_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_lines_type_check"
    CHECK ("line_type" IN ('hours_worked', 'fixed_period', 'overtime', 'bonus', 'commission')),
  CONSTRAINT "payroll_run_lines_hourly_xor_fixed_check"
    CHECK (
      ("line_type" IN ('hours_worked', 'overtime')
        AND "worked_minutes" IS NOT NULL
        AND "fixed_amount" IS NULL)
      OR
      ("line_type" IN ('fixed_period', 'bonus', 'commission')
        AND "fixed_amount" IS NOT NULL
        AND "worked_minutes" IS NULL)
    )
);

CREATE INDEX IF NOT EXISTS "payroll_run_lines_run_idx"
  ON "payroll_run_lines" ("run_id");
CREATE INDEX IF NOT EXISTS "payroll_run_lines_employee_run_idx"
  ON "payroll_run_lines" ("employee_id", "run_id");

-- Immutable gross-pay preview snapshots.
-- A new row is created for each explicit preview calculation.
-- Existing snapshots are never updated after insertion.
CREATE TABLE IF NOT EXISTS "payroll_run_previews" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "run_id" uuid NOT NULL,
  "company_id" uuid NOT NULL,
  -- Versioning inputs captured at calculation time
  "run_version_at_calc" integer NOT NULL,
  "settings_version_at_calc" integer NOT NULL,
  "company_version_at_calc" integer NOT NULL,
  -- Input snapshot (no sensitive data)
  "input_snapshot" jsonb NOT NULL,
  "input_hash" varchar(64) NOT NULL,             -- SHA-256 of canonical input JSON
  -- Calculation results
  "per_employee_results" jsonb NOT NULL,          -- array of PerEmployeeGross
  "gross_total" decimal(13, 4),                  -- NULL if any line is unsupported/blocked
  "supported_subtotal" decimal(13, 4),           -- sum of lines that could be calculated
  "has_unsupported_lines" boolean DEFAULT false NOT NULL,
  -- Completeness
  "completeness_state" text NOT NULL,            -- complete | partial | blocked
  -- Policy version so future policy changes can be detected
  "calc_policy_version" varchar(20) DEFAULT 'v1' NOT NULL,
  -- Tax/net pay: always null — gross-only phase
  "tax_not_calculated" boolean DEFAULT true NOT NULL,
  "net_pay_not_calculated" boolean DEFAULT true NOT NULL,
  -- Audit
  "calculated_by_user_id" uuid NOT NULL,
  "calculated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_run_previews_run_fk"
    FOREIGN KEY ("run_id") REFERENCES "payroll_runs"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_run_previews_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_previews_user_fk"
    FOREIGN KEY ("calculated_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT,
  CONSTRAINT "payroll_run_previews_completeness_check"
    CHECK ("completeness_state" IN ('complete', 'partial', 'blocked'))
);

CREATE INDEX IF NOT EXISTS "payroll_run_previews_run_idx"
  ON "payroll_run_previews" ("run_id", "calculated_at" DESC);

-- Idempotency records prevent duplicate create / preview on retry.
CREATE TABLE IF NOT EXISTS "payroll_idempotency_keys" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "idempotency_key" varchar(128) NOT NULL,
  "intent" varchar(100) NOT NULL,                -- create_employee | create_run | create_preview
  "payload_hash" varchar(64) NOT NULL,           -- SHA-256 of canonical request body
  "result_id" uuid,                              -- ID of created resource
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "payroll_idempotency_keys_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "payroll_idempotency_company_key_unique"
    UNIQUE ("company_id", "idempotency_key")
);

CREATE INDEX IF NOT EXISTS "payroll_idempotency_keys_company_idx"
  ON "payroll_idempotency_keys" ("company_id");
