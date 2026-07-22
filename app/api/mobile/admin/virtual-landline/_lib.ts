import { NextResponse } from 'next/server';
import { parseVirtualLandlineCsv } from '@/lib/virtual-landline/csv';
import {
  VIRTUAL_LANDLINE_PREVIEW_ONLY_CODE,
  VIRTUAL_LANDLINE_PREVIEW_ONLY_MESSAGE,
} from '@/lib/virtual-landline/mode';
import {
  isVirtualLandlineTableMissingError,
  serializeParsedCall,
  validateVirtualLandlineCsvFile,
} from '@/lib/virtual-landline/server';

export async function readVirtualLandlineCsvFromRequest(request: Request): Promise<
  | {
      ok: true;
      fileName: string;
      confirmed: boolean;
      parsed: ReturnType<typeof parseVirtualLandlineCsv>;
    }
  | {
      ok: false;
      response: NextResponse;
    }
> {
  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Invalid upload payload.' }, { status: 400 }),
    };
  }

  const fileValue = formData.get('file');
  const file = fileValue instanceof File ? fileValue : null;
  const fileError = validateVirtualLandlineCsvFile(file);
  if (fileError) {
    return {
      ok: false,
      response: NextResponse.json({ error: fileError }, { status: 400 }),
    };
  }

  try {
    const text = await file!.text();
    const parsed = parseVirtualLandlineCsv(text);
    return {
      ok: true,
      fileName: file!.name,
      confirmed: formData.get('confirm') === 'true',
      parsed,
    };
  } catch (error) {
    return {
      ok: false,
      response: NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid CSV.' },
        { status: 400 },
      ),
    };
  }
}

export function buildVirtualLandlinePreviewPayload(input: {
  fileName: string;
  parsed: ReturnType<typeof parseVirtualLandlineCsv>;
}) {
  const { parsed } = input;
  const state =
    parsed.totalRows === 0
      ? 'empty_history'
      : parsed.calls.length === 0
        ? 'invalid_csv'
        : parsed.invalidRows.length > 0 || parsed.duplicateRows.length > 0
          ? 'partial_preview'
          : 'ready';

  return {
    state,
    fileName: input.fileName,
    headers: parsed.headers,
    detectedColumns: parsed.detectedColumns,
    totalRows: parsed.totalRows,
    validRows: parsed.calls.length,
    invalidRows: parsed.invalidRows.length,
    duplicateRows: parsed.duplicateRows.length,
    missedRows: parsed.calls.filter((call) => call.direction === 'missed').length,
    counts: parsed.counts,
    previewRows: parsed.calls.slice(0, 25).map(serializeParsedCall),
    invalidSamples: parsed.invalidRows.slice(0, 25),
    duplicateSamples: parsed.duplicateRows.slice(0, 25),
    warningSamples: parsed.warningRows.slice(0, 25),
  };
}

export function virtualLandlineMigrationMissingResponse() {
  return NextResponse.json(
    {
      error: 'Virtual Landline storage is not ready. Please apply migration 0019_virtual_landline_interactions.sql to this environment.',
      code: 'VIRTUAL_LANDLINE_MIGRATION_REQUIRED',
    },
    { status: 503 },
  );
}

export function maybeVirtualLandlineMigrationMissingResponse(error: unknown): NextResponse | null {
  return isVirtualLandlineTableMissingError(error) ? virtualLandlineMigrationMissingResponse() : null;
}

export function virtualLandlinePreviewOnlyResponse() {
  return NextResponse.json(
    {
      error: VIRTUAL_LANDLINE_PREVIEW_ONLY_MESSAGE,
      code: VIRTUAL_LANDLINE_PREVIEW_ONLY_CODE,
      previewMode: true,
    },
    { status: 423 },
  );
}
