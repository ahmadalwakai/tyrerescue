import 'server-only';

import { db } from '@/lib/db';
import { withTaxWriteTransaction } from './write-transaction';
import {
  taxCompanyEntities,
  taxCompanyMemberships,
  taxCompanyRevisions,
  taxRegistrationStatuses,
  type NewTaxCompanyEntity,
  type NewTaxCompanyRevision,
  type NewTaxRegistrationStatus,
} from '@/lib/db/schema';
import { eq, and, sql } from 'drizzle-orm';
import { insertAuditEvent } from './audit-service';
import { FOUNDER_CAPABILITIES } from './permissions';
import type { TaxService, RegistrationStatus, CompanyProfileDto } from './contracts';
import type { CreateCompanyInput, UpdateCompanyInput } from './validation';

// ─── Shared error types ───────────────────────────────────────────────────────

export class CompanyServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | 'CONFLICT_DUPLICATE'
      | 'CONFLICT_VERSION'
      | 'NOT_FOUND'
      | 'INTERNAL',
  ) {
    super(message);
    this.name = 'CompanyServiceError';
  }
}

// ─── Mappers ─────────────────────────────────────────────────────────────────

export function entityToDto(row: {
  id: string;
  companyNumber: string;
  legalName: string;
  registeredAddressLine1: string;
  registeredAddressLine2: string | null;
  registeredCity: string | null;
  registeredCountry: string | null;
  registeredPostcode: string | null;
  tradingName: string | null;
  tradingAddress: string | null;
  businessEmail: string | null;
  businessPhone: string | null;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): CompanyProfileDto {
  return {
    id: row.id,
    companyNumber: row.companyNumber,
    legalName: row.legalName,
    registeredAddressLine1: row.registeredAddressLine1,
    registeredAddressLine2: row.registeredAddressLine2,
    registeredCity: row.registeredCity,
    registeredCountry: row.registeredCountry,
    registeredPostcode: row.registeredPostcode,
    tradingName: row.tradingName,
    tradingAddress: row.tradingAddress,
    businessEmail: row.businessEmail,
    businessPhone: row.businessPhone,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

// ─── Create ───────────────────────────────────────────────────────────────────
// Atomically creates the company, the founding membership, three default
// registration-status rows (unknown), and the creation audit event.
// Returns the new company profile DTO.
//
// Throws CompanyServiceError('CONFLICT_DUPLICATE') if the company number
// already exists. The UNIQUE constraint prevents races.

export async function createCompany(
  actorUserId: string,
  input: CreateCompanyInput,
): Promise<CompanyProfileDto> {
  // The configured neon-http driver does not implement interactive transactions.
  // A single writable CTE keeps all five writes atomic on that driver, including
  // rollback if membership, history, registration or audit creation fails.
  const insertValues: NewTaxCompanyEntity = {
    companyNumber: input.companyNumber.toUpperCase(),
    legalName: input.legalName,
    registeredAddressLine1: input.registeredAddressLine1,
    registeredAddressLine2: input.registeredAddressLine2 ?? null,
    registeredCity: input.registeredCity ?? null,
    registeredCountry: input.registeredCountry ?? null,
    registeredPostcode: input.registeredPostcode?.toUpperCase() ?? null,
    tradingName: input.tradingName ?? null,
    tradingAddress: input.tradingAddress ?? null,
    businessEmail: input.businessEmail ?? null,
    businessPhone: input.businessPhone ?? null,
    version: 1,
    createdByUserId: actorUserId,
  };

  const changedFields = Object.keys(insertValues).filter(
    (key) => key !== 'createdByUserId' && (insertValues as Record<string, unknown>)[key] != null,
  );
  try {
    const result = await db.execute<{ profile: CompanyProfileDto }>(sql`
      WITH created_company AS (
        INSERT INTO tax_company_entities (
          company_number, legal_name, registered_address_line1,
          registered_address_line2, registered_city, registered_country,
          registered_postcode, trading_name, trading_address, business_email,
          business_phone, version, created_by_user_id
        ) VALUES (
          ${insertValues.companyNumber}, ${insertValues.legalName}, ${insertValues.registeredAddressLine1},
          ${insertValues.registeredAddressLine2}, ${insertValues.registeredCity}, ${insertValues.registeredCountry},
          ${insertValues.registeredPostcode}, ${insertValues.tradingName}, ${insertValues.tradingAddress},
          ${insertValues.businessEmail}, ${insertValues.businessPhone}, 1, ${actorUserId}::uuid
        ) RETURNING *
      ), company_profile AS (
        SELECT id, jsonb_build_object(
          'id', id, 'companyNumber', company_number, 'legalName', legal_name,
          'registeredAddressLine1', registered_address_line1,
          'registeredAddressLine2', registered_address_line2,
          'registeredCity', registered_city, 'registeredCountry', registered_country,
          'registeredPostcode', registered_postcode, 'tradingName', trading_name,
          'tradingAddress', trading_address, 'businessEmail', business_email,
          'businessPhone', business_phone, 'version', version,
          'createdAt', to_char(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
          'updatedAt', to_char(updated_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"')
        ) AS profile FROM created_company
      ), founder_membership AS (
        INSERT INTO tax_company_memberships (company_id, user_id, capabilities, granted_by_user_id)
        SELECT id, ${actorUserId}::uuid, ${JSON.stringify(FOUNDER_CAPABILITIES)}::jsonb,
          ${actorUserId}::uuid FROM created_company
      ), initial_revision AS (
        INSERT INTO tax_company_revisions (company_id, version, snapshot, changed_fields, changed_by_user_id)
        SELECT id, 1, profile, ${JSON.stringify(changedFields)}::jsonb,
          ${actorUserId}::uuid FROM company_profile
      ), registration_statuses AS (
        INSERT INTO tax_registration_statuses (company_id, tax_service, status)
        SELECT company.id, service.name, 'unknown' FROM created_company company
        CROSS JOIN (VALUES ('corporation_tax'), ('vat'), ('paye')) AS service(name)
      ), creation_audit AS (
        INSERT INTO tax_audit_events (company_id, event_type, actor_user_id, payload)
        SELECT id, 'company_created', ${actorUserId}::uuid,
          jsonb_build_object('companyNumber', company_number) FROM created_company
      )
      SELECT profile FROM company_profile
    `);
    const company = result.rows[0]?.profile;
    if (!company) throw new CompanyServiceError('Insert did not return a row.', 'INTERNAL');
    return company;
  } catch (err: unknown) {
    // Drizzle wraps driver errors in `cause`; only a duplicate company number
    // should become a user-visible conflict, not another table's constraint.
    let cause: unknown = err;
    const visited = new Set<unknown>();
    while (cause && typeof cause === 'object' && !visited.has(cause)) {
      visited.add(cause);
      const pg = cause as { code?: string; constraint?: string; cause?: unknown };
      if (pg.code === '23505' && (
        pg.constraint === 'tax_company_entities_company_number_key' ||
        pg.constraint === 'tax_company_entities_company_number_idx'
      )) {
        throw new CompanyServiceError('A company with this number already exists.', 'CONFLICT_DUPLICATE');
      }
      cause = pg.cause;
    }
    throw err;
  }
}

// ─── Read ─────────────────────────────────────────────────────────────────────

export async function getCompanyById(id: string): Promise<CompanyProfileDto | null> {
  const [row] = await db
    .select()
    .from(taxCompanyEntities)
    .where(eq(taxCompanyEntities.id, id))
    .limit(1);
  return row ? entityToDto(row) : null;
}

export async function getCompaniesByUserId(userId: string): Promise<CompanyProfileDto[]> {
  const memberships = await db
    .select({ companyId: taxCompanyMemberships.companyId })
    .from(taxCompanyMemberships)
    .where(eq(taxCompanyMemberships.userId, userId));

  if (memberships.length === 0) return [];

  const companyIds = memberships.map((m) => m.companyId);

  // Fetch each company; avoid an IN() for now to keep the query simple.
  const results: CompanyProfileDto[] = [];
  for (const cid of companyIds) {
    const [row] = await db
      .select()
      .from(taxCompanyEntities)
      .where(eq(taxCompanyEntities.id, cid))
      .limit(1);
    if (row) results.push(entityToDto(row));
  }
  return results;
}

// ─── Update ───────────────────────────────────────────────────────────────────
// Optimistic concurrency: the caller supplies the version they last read.
// If the database row has a different version, a conflict error is thrown.
// Atomically: update entity, insert revision, insert audit event.

export async function updateCompany(
  actorUserId: string,
  companyId: string,
  input: UpdateCompanyInput,
): Promise<CompanyProfileDto> {
  return withTaxWriteTransaction(async (tx) => {
    // 1. Re-read current row and check version
    const [current] = await tx
      .select()
      .from(taxCompanyEntities)
      .where(eq(taxCompanyEntities.id, companyId))
      .limit(1);

    if (!current) {
      throw new CompanyServiceError('Company not found.', 'NOT_FOUND');
    }
    if (current.version !== input.expectedVersion) {
      throw new CompanyServiceError(
        `Version conflict: expected ${input.expectedVersion}, found ${current.version}.`,
        'CONFLICT_VERSION',
      );
    }

    // 2. Identify changed fields (only editable fields, never companyNumber)
    const editableFields = [
      'legalName',
      'registeredAddressLine1',
      'registeredAddressLine2',
      'registeredCity',
      'registeredCountry',
      'registeredPostcode',
      'tradingName',
      'tradingAddress',
      'businessEmail',
      'businessPhone',
    ] as const;

    type EditableKey = typeof editableFields[number];
    // Separate nullable columns from NOT NULL columns so Drizzle set() types are satisfied.
    type NullableEditableKey = Exclude<EditableKey, 'legalName' | 'registeredAddressLine1'>;
    type RequiredEditableKey = Extract<EditableKey, 'legalName' | 'registeredAddressLine1'>;

    const patchValues: Partial<Record<NullableEditableKey, string | null>> &
      Partial<Record<RequiredEditableKey, string>> = {};
    const changedFields: string[] = [];

    for (const field of editableFields) {
      if (!(field in input)) continue;
      const incoming = (input as Record<string, unknown>)[field];
      // Treat absent and undefined the same: skip
      if (incoming === undefined) continue;

      const currentVal = (current as Record<string, unknown>)[field];
      const normalised =
        typeof incoming === 'string' && incoming.trim() === '' ? null : (incoming as string | null);

      if (normalised !== (currentVal ?? null)) {
        (patchValues as Record<string, unknown>)[field] = normalised;
        changedFields.push(field);
      }
    }

    if (changedFields.length === 0) {
      // No changes — return current without writing
      return entityToDto(current);
    }

    const newVersion = current.version + 1;

    // 3. Update entity
    const [updated] = await tx
      .update(taxCompanyEntities)
      .set({ ...patchValues, version: newVersion, updatedAt: new Date() })
      .where(
        and(
          eq(taxCompanyEntities.id, companyId),
          eq(taxCompanyEntities.version, current.version),
        ),
      )
      .returning();

    if (!updated) {
      // Race condition: another request updated between our read and write
      throw new CompanyServiceError(
        'Version conflict: another update occurred concurrently.',
        'CONFLICT_VERSION',
      );
    }

    // 4. Insert revision snapshot
    const revision: NewTaxCompanyRevision = {
      companyId,
      version: newVersion,
      snapshot: entityToDto(updated) as unknown as Record<string, unknown>,
      changedFields,
      changedByUserId: actorUserId,
    };
    await tx.insert(taxCompanyRevisions).values(revision);

    // 5. Audit event
    await insertAuditEvent(tx, {
      companyId,
      eventType: 'profile_updated',
      actorUserId,
      payload: { changedFields, newVersion },
    });

    return entityToDto(updated);
  });
}

// ─── Registration status helpers ─────────────────────────────────────────────

export async function getRegistrationStatuses(companyId: string) {
  return db
    .select()
    .from(taxRegistrationStatuses)
    .where(eq(taxRegistrationStatuses.companyId, companyId));
}

export async function declareRegistrationStatus(
  actorUserId: string,
  companyId: string,
  taxService: TaxService,
  status: RegistrationStatus,
): Promise<void> {
  await withTaxWriteTransaction(async (tx) => {
    const now = new Date();

    // Upsert: if a row for this service already exists, update it.
    const [existing] = await tx
      .select({ id: taxRegistrationStatuses.id })
      .from(taxRegistrationStatuses)
      .where(
        and(
          eq(taxRegistrationStatuses.companyId, companyId),
          eq(taxRegistrationStatuses.taxService, taxService),
        ),
      )
      .limit(1);

    if (existing) {
      await tx
        .update(taxRegistrationStatuses)
        .set({
          status,
          declaredByUserId: actorUserId,
          declaredAt: now,
          updatedAt: now,
        })
        .where(eq(taxRegistrationStatuses.id, existing.id));
    } else {
      const row: NewTaxRegistrationStatus = {
        companyId,
        taxService,
        status,
        declaredByUserId: actorUserId,
        declaredAt: now,
      };
      await tx.insert(taxRegistrationStatuses).values(row);
    }

    await insertAuditEvent(tx, {
      companyId,
      eventType: 'registration_declared',
      actorUserId,
      payload: { taxService, status },
    });
  });
}
