import 'server-only';

/**
 * Tax document storage service.
 *
 * Stores generated documents (payslips, P60s, P45s, VAT returns, CT600 drafts)
 * as binary blobs associated with a company and entity.
 *
 * Storage backend: Neon database (binary column) for internal documents.
 * No external storage (S3, GCS, Vercel Blob) is connected in this phase.
 *
 * Documents are identified by a SHA-256 content hash to detect duplicates.
 * All stored documents are immutable once written.
 *
 * Download requires payroll.sensitive.read capability.
 */

import { db } from '@/lib/db';
import {
  taxDocuments,
  taxAuditEvents,
} from '@/lib/db/schema';
import { eq, and, desc } from 'drizzle-orm';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DocumentKind =
  | 'payslip'
  | 'p60'
  | 'p45'
  | 'p11d'
  | 'vat_return_draft'
  | 'ct600_draft'
  | 'fps_draft'
  | 'eps_draft';

export interface StoredDocument {
  id: string;
  companyId: string;
  kind: DocumentKind;
  entityId: string;      // payroll_run_id, vat_return_id, employee_id, etc.
  filename: string;
  mimeType: string;
  contentHash: string;
  sizeBytes: number;
  generatedAt: string;
  generatedByUserId: string;
  metadata: Record<string, unknown>;
}

export class DocumentError extends Error {
  constructor(
    message: string,
    public readonly code: 'NOT_FOUND' | 'DUPLICATE' | 'TOO_LARGE' | 'INTERNAL',
  ) {
    super(message);
    this.name = 'DocumentError';
  }
}

const MAX_DOCUMENT_SIZE_BYTES = 10 * 1024 * 1024; // 10 MB

// ─── Store ────────────────────────────────────────────────────────────────────

export async function storeDocument(
  actorUserId: string,
  companyId: string,
  kind: DocumentKind,
  entityId: string,
  filename: string,
  mimeType: string,
  contentBytes: Uint8Array,
  contentHash: string,
  metadata: Record<string, unknown> = {},
): Promise<StoredDocument> {
  if (contentBytes.byteLength > MAX_DOCUMENT_SIZE_BYTES) {
    throw new DocumentError(
      `Document exceeds maximum size (${MAX_DOCUMENT_SIZE_BYTES / 1024 / 1024} MB)`,
      'TOO_LARGE',
    );
  }

  // Check for duplicate by content hash
  const [existing] = await db
    .select({ id: taxDocuments.id })
    .from(taxDocuments)
    .where(
      and(
        eq(taxDocuments.companyId, companyId),
        eq(taxDocuments.contentHash, contentHash),
      ),
    )
    .limit(1);

  if (existing) {
    // Return the existing document metadata rather than re-storing
    const [doc] = await db
      .select()
      .from(taxDocuments)
      .where(eq(taxDocuments.id, existing.id))
      .limit(1);

    return toStoredDocument(doc);
  }

  const { randomUUID } = await import('crypto');
  const docId = randomUUID();
  const now = new Date();

  await db.insert(taxDocuments).values({
    id: docId,
    companyId,
    kind,
    entityId,
    filename,
    mimeType,
    contentHash,
    sizeBytes: contentBytes.byteLength,
    contentBlob: Buffer.from(contentBytes),
    generatedAt: now,
    generatedByUserId: actorUserId,
    metadata,
  });

  await db.insert(taxAuditEvents).values({
    companyId,
    eventType: 'document_stored',
    actorUserId,
    payload: { docId, kind, entityId, filename, sizeBytes: contentBytes.byteLength },
  });

  return {
    id: docId,
    companyId,
    kind,
    entityId,
    filename,
    mimeType,
    contentHash,
    sizeBytes: contentBytes.byteLength,
    generatedAt: now.toISOString(),
    generatedByUserId: actorUserId,
    metadata,
  };
}

// ─── Fetch metadata ───────────────────────────────────────────────────────────

export async function listDocumentsForEntity(
  companyId: string,
  entityId: string,
): Promise<StoredDocument[]> {
  const docs = await db
    .select()
    .from(taxDocuments)
    .where(
      and(
        eq(taxDocuments.companyId, companyId),
        eq(taxDocuments.entityId, entityId),
      ),
    )
    .orderBy(desc(taxDocuments.generatedAt));

  return docs.map(toStoredDocument);
}

export async function getDocumentBytes(
  companyId: string,
  docId: string,
): Promise<{ metadata: StoredDocument; bytes: Buffer }> {
  const [doc] = await db
    .select()
    .from(taxDocuments)
    .where(
      and(
        eq(taxDocuments.id, docId),
        eq(taxDocuments.companyId, companyId),
      ),
    )
    .limit(1);

  if (!doc) throw new DocumentError('Document not found', 'NOT_FOUND');

  return {
    metadata: toStoredDocument(doc),
    bytes: doc.contentBlob as Buffer,
  };
}

// ─── Private ──────────────────────────────────────────────────────────────────

function toStoredDocument(row: typeof taxDocuments.$inferSelect): StoredDocument {
  return {
    id: row.id,
    companyId: row.companyId,
    kind: row.kind as DocumentKind,
    entityId: row.entityId,
    filename: row.filename,
    mimeType: row.mimeType,
    contentHash: row.contentHash,
    sizeBytes: row.sizeBytes,
    generatedAt: (row.generatedAt instanceof Date ? row.generatedAt : new Date(row.generatedAt as string)).toISOString(),
    generatedByUserId: row.generatedByUserId,
    metadata: (row.metadata as Record<string, unknown>) ?? {},
  };
}
