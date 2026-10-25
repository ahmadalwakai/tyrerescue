-- Tax & Payroll Phase 1: company identity, memberships, revisions,
-- registration-status declarations, and audit events.
--
-- All tables are additive. No existing table is altered.
-- company_number is immutable after creation (enforced in application layer;
-- the unique constraint prevents re-use across entities).

CREATE TABLE IF NOT EXISTS "tax_company_entities" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_number" varchar(20) UNIQUE NOT NULL,
  "legal_name" varchar(255) NOT NULL,
  "registered_address_line1" text NOT NULL,
  "registered_address_line2" text,
  "registered_city" varchar(120),
  "registered_country" varchar(120),
  "registered_postcode" varchar(10),
  "trading_name" varchar(255),
  "trading_address" text,
  "business_email" varchar(255),
  "business_phone" varchar(30),
  "version" integer DEFAULT 1 NOT NULL,
  "created_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "tax_company_entities_created_by_fk"
    FOREIGN KEY ("created_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_company_entities_company_number_idx"
  ON "tax_company_entities" ("company_number");

-- One membership row per (company, user). capabilities is a JSON array of
-- strings, e.g. ["tax.read","tax.company.write"].
CREATE TABLE IF NOT EXISTS "tax_company_memberships" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "user_id" uuid NOT NULL,
  "capabilities" jsonb DEFAULT '["tax.read"]'::jsonb NOT NULL,
  "granted_by_user_id" uuid,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "tax_company_memberships_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_company_memberships_user_fk"
    FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_company_memberships_granted_by_fk"
    FOREIGN KEY ("granted_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_company_memberships_company_user_unique"
  ON "tax_company_memberships" ("company_id", "user_id");
CREATE INDEX IF NOT EXISTS "tax_company_memberships_user_idx"
  ON "tax_company_memberships" ("user_id");

-- Full snapshot of each profile version for history preservation.
CREATE TABLE IF NOT EXISTS "tax_company_revisions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "version" integer NOT NULL,
  "snapshot" jsonb NOT NULL,
  "changed_fields" jsonb DEFAULT '[]'::jsonb NOT NULL,
  "changed_by_user_id" uuid NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "tax_company_revisions_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_company_revisions_user_fk"
    FOREIGN KEY ("changed_by_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_company_revisions_company_version_unique"
  ON "tax_company_revisions" ("company_id", "version");
CREATE INDEX IF NOT EXISTS "tax_company_revisions_company_created_idx"
  ON "tax_company_revisions" ("company_id", "created_at");

-- Administrator declarations about registration status. One row per
-- (company, tax_service). Status starts as 'unknown' and can only be
-- updated to 'not_registered' or 'registered' by an authorised member.
-- A declaration is NOT proof of actual HMRC registration.
CREATE TABLE IF NOT EXISTS "tax_registration_statuses" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "tax_service" text NOT NULL,
  "status" text DEFAULT 'unknown' NOT NULL,
  "declared_by_user_id" uuid,
  "declared_at" timestamptz,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  "updated_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "tax_registration_statuses_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_registration_statuses_user_fk"
    FOREIGN KEY ("declared_by_user_id") REFERENCES "users"("id") ON DELETE SET NULL,
  CONSTRAINT "tax_registration_statuses_service_check"
    CHECK ("tax_service" IN ('corporation_tax', 'vat', 'paye')),
  CONSTRAINT "tax_registration_statuses_status_check"
    CHECK ("status" IN ('unknown', 'not_registered', 'registered'))
);

CREATE UNIQUE INDEX IF NOT EXISTS "tax_registration_statuses_company_service_unique"
  ON "tax_registration_statuses" ("company_id", "tax_service");

-- Company-scoped audit log. Payload never contains credentials or tokens.
CREATE TABLE IF NOT EXISTS "tax_audit_events" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "company_id" uuid NOT NULL,
  "event_type" text NOT NULL,
  "actor_user_id" uuid NOT NULL,
  "payload" jsonb DEFAULT '{}'::jsonb NOT NULL,
  "created_at" timestamptz DEFAULT NOW() NOT NULL,
  CONSTRAINT "tax_audit_events_company_fk"
    FOREIGN KEY ("company_id") REFERENCES "tax_company_entities"("id") ON DELETE CASCADE,
  CONSTRAINT "tax_audit_events_user_fk"
    FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE RESTRICT
);

CREATE INDEX IF NOT EXISTS "tax_audit_events_company_created_idx"
  ON "tax_audit_events" ("company_id", "created_at" DESC);
