/**
 * Tyre Size Parsing & Validation — Single Source of Truth
 *
 * Handles standard format (205/55/R16), compact format (155/R13),
 * and commercial suffix (195/75/R16C).
 *
 * No DB access — pure functions only.
 */

// ── Types ──────────────────────────────────────────────

export interface ParsedTyreSize {
  sizeDisplay: string;   // canonical "205/55/R16" or "155/R13" or "195/75/R16C"
  width: number;
  aspect: number;        // 0 for compact sizes like 155/R13
  rim: number;
  isCommercial: boolean;
}

export type TyreSizeParseResult = {
  valid: true;
  size: ParsedTyreSize;
} | {
  valid: false;
  error: string;
};

// ── Regex Patterns ──────────────────────────────────────

/** Standard: 205/55/R16 or 205/55/R16C */
export const STANDARD_TYRE_SIZE_REGEX = /^(\d{3})\/(\d{2,3})\/R(\d{2})(C?)$/i;

/** Compact: 155/R13 or 175/R16C */
export const COMPACT_TYRE_SIZE_REGEX = /^(\d{3})\/R(\d{2})(C?)$/i;

// ── Parsing ─────────────────────────────────────────────

/**
 * Parse a tyre size string into structured components.
 * Supports standard (205/55/R16), compact (155/R13), and commercial (C suffix).
 */
export function parseTyreSize(input: string): TyreSizeParseResult {
  if (!input || typeof input !== 'string') {
    return { valid: false, error: 'Empty or non-string input' };
  }

  const trimmed = input.trim().toUpperCase();

  // Try standard format first: 205/55/R16 or 205/55/R16C
  const stdMatch = trimmed.match(STANDARD_TYRE_SIZE_REGEX);
  if (stdMatch) {
    const width = Number(stdMatch[1]);
    const aspect = Number(stdMatch[2]);
    const rim = Number(stdMatch[3]);
    const isCommercial = stdMatch[4] === 'C';

    const rangeError = validateRanges(width, aspect, rim);
    if (rangeError) return { valid: false, error: rangeError };

    return {
      valid: true,
      size: {
        sizeDisplay: formatSizeDisplay(width, aspect, rim, isCommercial),
        width,
        aspect,
        rim,
        isCommercial,
      },
    };
  }

  // Try compact format: 155/R13 or 175/R16C
  const compactMatch = trimmed.match(COMPACT_TYRE_SIZE_REGEX);
  if (compactMatch) {
    const width = Number(compactMatch[1]);
    const rim = Number(compactMatch[2]);
    const isCommercial = compactMatch[3] === 'C';

    const rangeError = validateRanges(width, 0, rim);
    if (rangeError) return { valid: false, error: rangeError };

    return {
      valid: true,
      size: {
        sizeDisplay: formatSizeDisplay(width, 0, rim, isCommercial),
        width,
        aspect: 0,
        rim,
        isCommercial,
      },
    };
  }

  return { valid: false, error: `Invalid size format: "${input}". Expected NNN/NN/RNN or NNN/RNN` };
}

/**
 * Validate a tyre size string. Returns true if valid.
 */
export function validateTyreSize(input: string): { valid: boolean; error?: string } {
  const result = parseTyreSize(input);
  if (result.valid) return { valid: true };
  return { valid: false, error: result.error };
}

/**
 * Normalize a tyre size string to its canonical display form.
 * Returns the input trimmed/uppercased if it cannot be parsed.
 */
export function normalizeTyreSize(input: string): string {
  const result = parseTyreSize(input);
  if (result.valid) return result.size.sizeDisplay;
  // Fallback: basic cleanup for non-standard inputs
  return input.trim().toUpperCase().replace(/\s+/g, '');
}

// ── Internal Helpers ────────────────────────────────────

function validateRanges(width: number, aspect: number, rim: number): string | null {
  if (width < 100 || width > 400) return `Width out of range: ${width}`;
  if (aspect !== 0 && (aspect < 0 || aspect > 100)) return `Aspect out of range: ${aspect}`;
  if (rim < 10 || rim > 26) return `Rim out of range: ${rim}`;
  return null;
}

function formatSizeDisplay(width: number, aspect: number, rim: number, isCommercial: boolean): string {
  const rimStr = `R${rim}${isCommercial ? 'C' : ''}`;
  return aspect > 0 ? `${width}/${aspect}/${rimStr}` : `${width}/${rimStr}`;
}
