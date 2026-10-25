/** Production mutation requires the explicit post-TestFlight release-go flag. */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import dotenv from 'dotenv';
import WebSocket from 'ws';
import { Pool, neonConfig } from '@neondatabase/serverless';
import { is } from 'drizzle-orm';
import { PgTable, getTableConfig } from 'drizzle-orm/pg-core';
import * as schema from '../../lib/db/schema';

const ROOT = path.resolve('.');
const ARTIFACTS = path.join(ROOT, '.vercel/db-release-preflight-20261021');
const expectedProductionHost = 'ep-quiet-violet-ad1uxuyv-pooler.c-2.us-east-1.aws.neon.tech';
const expectedBranchId = 'br-royal-meadow-ad8r8wj6';
const expectedParentId = 'br-purple-bread-adg1fsdo';
const journal = JSON.parse(fs.readFileSync(path.join(ROOT, 'drizzle/migrations/meta/_journal.json'), 'utf8')) as { entries: Array<{ tag: string; when: number }> };
// 0025 is unrelated AI receptionist work and is deliberately not released here.
const selected = journal.entries.filter((entry) => Number(entry.tag.slice(0, 4)) >= 26);
const sha = (value: string) => crypto.createHash('sha256').update(value).digest('hex');
const save = (name: string, value: unknown) => fs.writeFileSync(path.join(ARTIFACTS, name), JSON.stringify(value, null, 2));
const counters = ['bookings', 'payments', 'payment_events', 'quotes', 'quick_bookings', 'stock_inventory_balances', 'stock_reservations', 'admin_push_tokens'];
let currentStep = 'configuration';

// The SQL is additive. Refuse row-level changes and remove only the historical
// non-idempotent ADD CHECK wrapper on replay, after verifying it exists already.
function safeSql(tag: string) {
  let source = fs.readFileSync(path.join(ROOT, 'drizzle/migrations', `${tag}.sql`), 'utf8');
  if (/^\s*(UPDATE|DELETE|TRUNCATE|INSERT|DROP\s+(TABLE|SCHEMA|DATABASE))\s/im.test(source)) throw new Error('Migration contains a prohibited data mutation');
  if (tag === '0028_tax_payroll_phase2b_to_5') {
    const check = /ALTER TABLE "journal_lines"\s+ADD CONSTRAINT "journal_lines_nonzero"\s+CHECK \("debit_pence" > 0 OR "credit_pence" > 0\);/;
    if (!check.test(source)) throw new Error('The expected idempotent constraint wrapper no longer matches migration 0028');
    source = source.replace(check, () => `DO $$ BEGIN
      IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conrelid='journal_lines'::regclass AND conname='journal_lines_nonzero') THEN
        ALTER TABLE journal_lines ADD CONSTRAINT journal_lines_nonzero CHECK (debit_pence > 0 OR credit_pence > 0);
      END IF;
    END $$;`);
  }
  return source;
}

async function main() {
  fs.mkdirSync(ARTIFACTS, { recursive: true });
  const env = dotenv.parse(fs.readFileSync(path.join(ARTIFACTS, 'production.env')));
  const keyMetadataPath = path.join(ARTIFACTS, 'encryption-key-metadata.json');
  const keyMetadata = fs.existsSync(keyMetadataPath) ? JSON.parse(fs.readFileSync(keyMetadataPath, 'utf8')) : null;
  const protectedKeyPresent = keyMetadata?.keyName === 'PAYROLL_FIELD_ENCRYPTION_KEY' && keyMetadata?.environment === 'production' && keyMetadata?.present === true;
  if (!env.DATABASE_URL || env.DATABASE_URL === '[SENSITIVE]') throw new Error('A protected readable production DATABASE_URL is required');
  const targetUrl = new URL(env.DATABASE_URL);
  if (targetUrl.hostname !== expectedProductionHost || targetUrl.pathname !== '/neondb') throw new Error('Production target does not match the verified TyreRescue endpoint');
  const rehearse = process.argv.includes('--rehearse');
  const applyProduction = process.argv.includes('--apply-approved-production');
  if (rehearse && applyProduction) throw new Error('Unsafe mixed release modes');
  const mutate = rehearse || applyProduction;
  let isolatedBranchId: string | null = null;
  if (rehearse) {
    const target = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, 'rehearsal-target.json'), 'utf8'));
    if (target.branchId !== expectedBranchId || target.parentBranchId !== expectedParentId || target.host === targetUrl.hostname
      || !/^ep-[a-z-]+[a-z0-9]+\.c-\d\.us-east-1\.aws\.neon\.tech$/.test(target.host)) throw new Error('Unsafe rehearsal target');
    targetUrl.hostname = target.host;
    isolatedBranchId = target.branchId;
  }
  neonConfig.webSocketConstructor = WebSocket;
  currentStep = 'connecting';
  const pool = new Pool({ connectionString: targetUrl.toString(), max: 1, connectionTimeoutMillis: 15000 });
  const client = await pool.connect();
  try {
    await client.query(mutate ? 'BEGIN ISOLATION LEVEL REPEATABLE READ' : 'BEGIN READ ONLY');
    currentStep = 'metadata-and-counters';
    await client.query("SET LOCAL statement_timeout='60s'");
    await client.query("SET LOCAL lock_timeout='8s'");
    if (mutate) await client.query('SELECT pg_advisory_xact_lock(1381192786,20261021)');
    const history = (await client.query('SELECT id,hash,created_at FROM drizzle.__drizzle_migrations ORDER BY created_at,id')).rows;
    const columnsBefore = (await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    const countersBefore: Record<string, string> = {};
    for (const table of counters) countersBefore[table] = (await client.query(`SELECT count(*)::text AS count FROM "${table}"`)).rows[0].count;
    const markerStatus = selected.map((entry) => {
      const source = fs.readFileSync(path.join(ROOT, 'drizzle/migrations', `${entry.tag}.sql`), 'utf8');
      const hash = sha(source);
      const marker = history.find((row) => Number(row.created_at) === entry.when);
      return { tag: entry.tag, when: entry.when, hash, appliedMarker: Boolean(marker), markerHashMatches: marker ? marker.hash === hash : null,
        skippedByNormalTimestampMigration: !marker && entry.when <= Math.max(...history.map((row) => Number(row.created_at))) };
    });
    const plan = selected.map((entry) => ({ ...entry, sql: safeSql(entry.tag) }));
    fs.writeFileSync(path.join(ARTIFACTS, 'ordered-additive-plan.sql'), plan.map((item) => `-- ${item.tag}\n${item.sql}`).join('\n\n'));
    if (applyProduction) {
      const rehearsal = JSON.parse(fs.readFileSync(path.join(ARTIFACTS, 'rehearsal-report.json'), 'utf8'));
      if (rehearsal.isolatedBranchId !== expectedBranchId || !rehearsal.schemaReplayedTwice
        || markerStatus.some((entry) => rehearsal.markerStatus.find((item: { tag: string }) => item.tag === entry.tag)?.hash !== entry.hash)) {
        throw new Error('Migration source differs from the successful isolated rehearsal');
      }
    }
    if (mutate) {
      for (let iteration = 1; iteration <= (rehearse ? 2 : 1); iteration++) {
        for (const migration of plan) {
          const sourceHash = markerStatus.find((item) => item.tag === migration.tag)!.hash;
          const existing = await client.query('SELECT hash FROM drizzle.__drizzle_migrations WHERE created_at=$1', [migration.when]);
          if (existing.rows.length && existing.rows[0].hash !== sourceHash) throw new Error('Migration marker hash mismatch');
          // Production gets the exact schema SQL rehearsed twice on its clone.
          currentStep = `${rehearse ? 'rehearsal' : 'approved-schema'}-${migration.tag}-iteration-${iteration}`;
          await client.query(migration.sql);
          if (!existing.rows.length) await client.query('INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)', [sourceHash, migration.when]);
        }
      }
    }
    const columnsAfter = (await client.query("SELECT table_name,column_name,data_type,is_nullable,column_default FROM information_schema.columns WHERE table_schema='public' ORDER BY table_name,ordinal_position")).rows;
    currentStep = 'schema-and-counter-validation';
    const expected = Object.values(schema).filter((value) => is(value, PgTable)).map((table) => {
      const definition = getTableConfig(table as PgTable);
      return { table: definition.name, columns: definition.columns.map((column) => column.name) };
    });
    const actual = new Map<string, Set<string>>();
    for (const row of columnsAfter) { if (!actual.has(row.table_name)) actual.set(row.table_name, new Set()); actual.get(row.table_name)!.add(row.column_name); }
    const missingTables = expected.filter((table) => !actual.has(table.table)).map((table) => table.table);
    const missingColumns = expected.filter((table) => actual.has(table.table)).flatMap((table) => table.columns.filter((column) => !actual.get(table.table)!.has(column)).map((column) => ({ table: table.table, column })));
    if (mutate && (missingColumns.length || missingTables.some((table) => table !== 'ai_call_sessions'))) throw new Error('Migration did not produce the required server schema');
    const countersAfter: Record<string, string> = {};
    for (const table of counters) countersAfter[table] = (await client.query(`SELECT count(*)::text AS count FROM "${table}"`)).rows[0].count;
    if (mutate && JSON.stringify(countersAfter) !== JSON.stringify(countersBefore)) throw new Error('An existing business table count changed during additive schema application');
    const constraints = (await client.query("SELECT c.relname AS table_name,n.conname,pg_get_constraintdef(n.oid) AS definition FROM pg_constraint n JOIN pg_class c ON c.oid=n.conrelid JOIN pg_namespace ns ON ns.oid=c.relnamespace WHERE ns.nspname='public' AND c.relname IN ('payroll_runs','payroll_employee_starter_data','tax_reviews','payroll_hmrc_payments','payroll_hmrc_adjustments') ORDER BY c.relname,n.conname")).rows;
    await client.query('COMMIT');
    const report = { checkedAt: new Date().toISOString(), mode: rehearse ? 'isolated_branch_rehearsal' : applyProduction ? 'approved_additive_production_schema' : 'read_only_production', isolatedBranchId,
      productionWrites: applyProduction, customerDataWrites: false, advisoryGuard: mutate, markerStatus, missingTables, missingColumns, countersBefore, countersAfter,
      columnCountBefore: columnsBefore.length, columnCountAfter: columnsAfter.length,
      sensitiveEnvironment: { PAYROLL_FIELD_ENCRYPTION_KEY: { present: protectedKeyPresent || Boolean(env.PAYROLL_FIELD_ENCRYPTION_KEY),
        locallyGeneratedFormatValidated: keyMetadata?.generatedFormatValidated === true,
        readableSnapshotFormatValid: /^[a-f0-9]{64}$/i.test(env.PAYROLL_FIELD_ENCRYPTION_KEY ?? '') } },
      sourceFiles: plan.map((entry) => entry.tag), schemaReplayedTwice: rehearse, constraints,
    };
    const reportName = rehearse ? 'rehearsal-report.json' : applyProduction ? 'production-schema-application-report.json' : 'production-readonly-report.json';
    save(reportName, report);
    save(rehearse ? 'rehearsal-columns.json' : 'production-columns-direct.json', columnsAfter);
    console.log(JSON.stringify({ mode: report.mode, missingTables, missingColumns, countersUnchanged: JSON.stringify(countersBefore) === JSON.stringify(countersAfter),
      missingEnvironmentNames: protectedKeyPresent || env.PAYROLL_FIELD_ENCRYPTION_KEY ? [] : ['PAYROLL_FIELD_ENCRYPTION_KEY'], schemaReplayedTwice: rehearse, productionWrites: applyProduction, customerDataWrites: false,
      reportPath: path.join(ARTIFACTS, reportName) }));
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally { client.release(); await pool.end(); }
}

main().catch((error) => {
  // Driver messages may contain a connection string or SQL; return no raw error.
  const pgCode = typeof error?.code === 'string' && /^[A-Z0-9]{5}$/.test(error.code) ? error.code : null;
  console.error(JSON.stringify({ preflightFailed: true, currentStep, errorName: error instanceof Error ? error.name : 'Error', pgCode,
    databaseMessage: pgCode && /^(rehearsal-|approved-schema-)/.test(currentStep) ? String(error.message).replace(/(?:postgres(?:ql)?|wss?|https?):\/\/\S+/gi, '[redacted-url]').slice(0, 240) : undefined,
    safeReason: error instanceof Error && /^(Migration|An existing|Unsafe|Production target|A protected|The expected)/.test(error.message) ? error.message : 'Preflight failed without exposing credentials; inspect the bounded script or rerun read-only.' }));
  process.exitCode = 1;
});
