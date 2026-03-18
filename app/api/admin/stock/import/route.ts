import { NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { db } from '@/lib/db';
import { tyreCatalogue, tyreProducts } from '@/lib/db/schema';
import { eq, and, ilike } from 'drizzle-orm';

/* ─── Size parsing ─────────────────────────────────────── */

interface ParsedRow {
  sizeDisplay: string;
  width: number;
  aspect: number;
  rim: number;
  isCommercial: boolean;
  quantity: number;
  rowIndex: number;
}

/** Parse a tyre size string like "195/60/R16", "155/R13", "215/65/R16C" */
function parseSizeString(raw: string): Omit<ParsedRow, 'quantity' | 'rowIndex'> | null {
  const s = raw.trim().toUpperCase();
  const m = s.match(/^(\d+)\/(?:(\d+)\/)?R(\d+)(C?)$/);
  if (!m) return null;
  const width = Number(m[1]);
  const aspect = m[2] ? Number(m[2]) : 0;
  const rim = Number(m[3]);
  const isCommercial = m[4] === 'C';
  if (width < 100 || width > 400 || rim < 10 || rim > 26) return null;
  if (m[2] && (aspect < 0 || aspect > 100)) return null;
  const rimStr = `R${rim}${isCommercial ? 'C' : ''}`;
  const sizeDisplay = aspect > 0 ? `${width}/${aspect}/${rimStr}` : `${width}/${rimStr}`;
  return { sizeDisplay, width, aspect, rim, isCommercial };
}

/* ─── CSV parsing ──────────────────────────────────────── */

function parseCsvContent(text: string): { size: string; qty: number; row: number }[] {
  const results: { size: string; qty: number; row: number }[] = [];
  const lines = text.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Split by comma, semicolon, or tab
    const parts = line.split(/[,;\t]+/).map(p => p.trim().replace(/^["']|["']$/g, ''));
    if (parts.length < 2) continue;
    const size = parts[0];
    const qty = parseInt(parts[1], 10);
    if (!size || isNaN(qty)) continue;
    results.push({ size, qty: Math.max(0, qty), row: i + 1 });
  }
  return results;
}

/* ─── Excel parsing ────────────────────────────────────── */

function parseExcelContent(buffer: Buffer): { size: string; qty: number; row: number }[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '' }) as unknown[][];
  const results: { size: string; qty: number; row: number }[] = [];
  for (let i = 0; i < rows.length; i++) {
    const cells = rows[i];
    if (!cells || cells.length < 2) continue;
    const size = String(cells[0] || '').trim();
    const qty = parseInt(String(cells[1] || '0'), 10);
    if (!size || isNaN(qty)) continue;
    results.push({ size, qty: Math.max(0, qty), row: i + 1 });
  }
  return results;
}

/* ─── Helpers ──────────────────────────────────────────── */

function speedRatingFor(rim: number): string {
  if (rim <= 15) return 'H';
  if (rim <= 18) return 'V';
  return 'W';
}
function loadIndexFor(width: number, aspect: number): number {
  const vol = width * ((aspect || 80) / 100);
  if (vol < 80) return 82;
  if (vol < 95) return 86;
  if (vol < 110) return 91;
  if (vol < 125) return 94;
  if (vol < 140) return 97;
  return 100;
}
function suggestedPrice(rim: number): string {
  const p: Record<number, number> = {
    10: 48, 12: 48, 13: 48, 14: 48, 15: 58, 16: 58,
    17: 72, 18: 72, 19: 92, 20: 92, 21: 115,
  };
  return String(p[rim] ?? 58);
}
function makeSlug(...parts: (string | number)[]): string {
  return parts
    .join('-')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

/* ─── Route handler ────────────────────────────────────── */

/**
 * POST /api/admin/stock/import
 * Accepts CSV, TSV, or Excel (.xlsx/.xls) files.
 * Returns detailed import summary with duplicate detection.
 */
export async function POST(request: Request) {
  const session = await auth();
  if (!session || session.user.role !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get('file') as File | null;
  if (!file || file.size === 0) {
    return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
  }

  // 10 MB limit
  if (file.size > 10 * 1024 * 1024) {
    return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = (file.name || '').split('.').pop()?.toLowerCase() || '';
  const mimeType = file.type || '';

  // Step 1 — Parse file into raw rows: [size, quantity]
  let rawRows: { size: string; qty: number; row: number }[];

  const isExcel = ext === 'xlsx' || ext === 'xls' ||
    mimeType.includes('spreadsheet') || mimeType.includes('excel');
  const isCsv = ext === 'csv' || ext === 'tsv' || ext === 'txt' ||
    mimeType.includes('csv') || mimeType.includes('tab-separated') ||
    mimeType === 'text/plain';

  if (isExcel) {
    try {
      rawRows = parseExcelContent(buffer);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse Excel file. Ensure it is a valid .xlsx or .xls file.' },
        { status: 400 },
      );
    }
  } else if (isCsv) {
    try {
      const text = buffer.toString('utf-8');
      rawRows = parseCsvContent(text);
    } catch {
      return NextResponse.json(
        { error: 'Failed to parse text file.' },
        { status: 400 },
      );
    }
  } else {
    // Attempt text first, fall back to Excel
    const text = buffer.toString('utf-8');
    const csvAttempt = parseCsvContent(text);
    if (csvAttempt.length > 0) {
      rawRows = csvAttempt;
    } else {
      try {
        rawRows = parseExcelContent(buffer);
      } catch {
        return NextResponse.json(
          { error: `Unsupported file format: .${ext || 'unknown'}. Use CSV, TSV, or Excel (.xlsx/.xls).` },
          { status: 400 },
        );
      }
    }
  }

  if (rawRows.length === 0) {
    return NextResponse.json(
      { error: 'No data rows found in file. Expected format: size, quantity (one per row).' },
      { status: 400 },
    );
  }

  // Step 2 — Parse & validate each row
  const validRows: ParsedRow[] = [];
  const invalidRows: { row: number; raw: string; reason: string }[] = [];
  const fileDuplicates = new Map<string, number[]>(); // sizeDisplay → row numbers

  for (const { size, qty, row } of rawRows) {
    const parsed = parseSizeString(size);
    if (!parsed) {
      invalidRows.push({ row, raw: size, reason: 'Unrecognised tyre size format' });
      continue;
    }
    // Track in-file duplicates
    const existing = fileDuplicates.get(parsed.sizeDisplay);
    if (existing) {
      existing.push(row);
      continue; // skip duplicate — first occurrence is kept
    }
    fileDuplicates.set(parsed.sizeDisplay, [row]);
    validRows.push({ ...parsed, quantity: qty, rowIndex: row });
  }

  // Collect sizes that appeared more than once in the file
  const inFileDuplicateSizes: string[] = [];
  for (const [sd, rows] of fileDuplicates) {
    if (rows.length > 1) inFileDuplicateSizes.push(sd);
  }

  // Step 3 — Check existing DB products for duplicates
  const dbDuplicateSizes: string[] = [];
  const toInsert: ParsedRow[] = [];

  for (const row of validRows) {
    const [existing] = await db
      .select({ id: tyreProducts.id })
      .from(tyreProducts)
      .where(
        and(
          ilike(tyreProducts.brand, 'budget'),
          eq(tyreProducts.sizeDisplay, row.sizeDisplay),
        )
      )
      .limit(1);

    if (existing) {
      dbDuplicateSizes.push(row.sizeDisplay);
    } else {
      toInsert.push(row);
    }
  }

  // Step 4 — Insert new products
  let insertedCount = 0;
  const errors: string[] = [];

  for (const row of toInsert) {
    try {
      // Find or create catalogue entry
      let [catRow] = await db
        .select()
        .from(tyreCatalogue)
        .where(
          and(
            eq(tyreCatalogue.width, row.width),
            eq(tyreCatalogue.aspect, row.aspect),
            eq(tyreCatalogue.rim, row.rim),
            eq(tyreCatalogue.tier, 'budget'),
            eq(tyreCatalogue.sizeDisplay, row.sizeDisplay),
          )
        )
        .limit(1);

      if (!catRow) {
        const slug = makeSlug('budget', 'all-season', row.width, row.aspect, `r${row.rim}`,
          row.isCommercial ? 'c' : '', 'budget', Date.now());
        const [inserted] = await db.insert(tyreCatalogue).values({
          brand: 'Budget',
          pattern: 'All-Season',
          width: row.width,
          aspect: row.aspect,
          rim: row.rim,
          sizeDisplay: row.sizeDisplay,
          season: 'allseason',
          speedRating: speedRatingFor(row.rim),
          loadIndex: loadIndexFor(row.width, row.aspect),
          wetGrip: 'C',
          fuelEfficiency: 'C',
          noiseDb: 71,
          runFlat: false,
          tier: 'budget',
          suggestedPriceNew: suggestedPrice(row.rim),
          slug,
        }).onConflictDoNothing().returning();
        if (inserted) catRow = inserted;
      }

      if (!catRow) {
        errors.push(`Row ${row.rowIndex}: failed to create catalogue for ${row.sizeDisplay}`);
        continue;
      }

      const prodSlug = makeSlug('budget', 'all-season', row.width, row.aspect, `r${row.rim}`,
        row.isCommercial ? 'c' : '', Date.now());

      await db.insert(tyreProducts).values({
        catalogueId: catRow.id,
        brand: 'Budget',
        pattern: 'All-Season',
        width: row.width,
        aspect: row.aspect,
        rim: row.rim,
        sizeDisplay: row.sizeDisplay,
        season: 'allseason',
        speedRating: speedRatingFor(row.rim),
        loadIndex: loadIndexFor(row.width, row.aspect),
        wetGrip: 'C',
        fuelEfficiency: 'C',
        noiseDb: 71,
        runFlat: false,
        priceNew: suggestedPrice(row.rim),
        stockNew: row.quantity,
        stockOrdered: 0,
        isLocalStock: true,
        availableNew: true,
        featured: false,
        slug: prodSlug,
      });
      insertedCount++;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Unknown error';
      errors.push(`Row ${row.rowIndex} (${row.sizeDisplay}): ${msg}`);
    }
  }

  return NextResponse.json({
    success: true,
    summary: {
      totalRows: rawRows.length,
      inserted: insertedCount,
      skippedDbDuplicates: dbDuplicateSizes.length,
      skippedFileDuplicates: inFileDuplicateSizes.length,
      invalidRows: invalidRows.length,
      errors: errors.length,
    },
    duplicateSizes: {
      existingInDb: dbDuplicateSizes,
      duplicatesInFile: inFileDuplicateSizes,
    },
    invalidRows: invalidRows.slice(0, 50), // cap at 50 for response size
    errors: errors.slice(0, 50),
  });
}
