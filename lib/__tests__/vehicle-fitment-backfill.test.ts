import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();

function readBackfillSource(): string {
  return readFileSync(join(root, 'scripts/backfill-vehicle-tyre-fitments.ts'), 'utf8');
}

describe('vehicle fitment backfill script contract', () => {
  it('defaults to dry-run and refuses writes without explicit review', () => {
    const source = readBackfillSource();

    expect(source).toContain("const write = args.has('--write')");
    expect(source).toContain("const reviewed = args.has('--reviewed')");
    expect(source).toContain("if (write && !reviewed)");
    expect(source).toContain('Refusing to write without --reviewed');
    expect(source).toContain('No database writes are performed without --write and --reviewed.');
  });

  it('reports deterministic source stats and existing-record actions', () => {
    const source = readBackfillSource();

    expect(source).toContain('deterministicDigest');
    expect(source).toContain('deterministicOrdering');
    expect(source).toContain('sourceStats');
    expect(source).toContain('wouldInsert');
    expect(source).toContain('wouldSkip');
    expect(source).toContain('existingStatus');
    expect(source).toContain('loadExistingFitmentStatuses');
  });

  it('separates rejected incomplete data from human review conflicts', () => {
    const source = readBackfillSource();

    expect(source).toContain('type RejectionCategory');
    expect(source).toContain('missing_vehicle_identity');
    expect(source).toContain('missing_structured_tyre_lines');
    expect(source).toContain('invalid_tyre_size_format');
    expect(source).toContain('rejectedCount: rejected.length');
    expect(source).toContain('invalidTyreSizeGroups: invalidTyreSizeGroups(rejected)');
    expect(source).toContain('acceptedPreviewLimit: 5');
    expect(source).toContain('categoryOverlapSemantics');
    expect(source).toContain('reviewCount is reserved for conflicting structured records and write failures');
    expect(source).toContain('registrationNumber: maskedVrm(item.registrationNumber)');
    expect(source).toContain('accepted.slice(0, 5)');
  });
});
