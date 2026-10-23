import type { JobSummary, JobTyreLine } from '@/api/client';

function quantityValue(value: unknown): number | null {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return null;
  const quantity = Math.round(parsed);
  return quantity > 0 ? quantity : null;
}

function axleLabel(value: string | null | undefined): string | null {
  const raw = value?.trim();
  if (!raw) return null;
  const normalized = raw.toLowerCase();
  if (normalized === 'front') return 'Front';
  if (normalized === 'rear') return 'Rear';
  if (normalized === 'unknown' || normalized === 'unspecified') return 'Unknown axle';
  if (normalized === 'all' || normalized === 'both') return 'All tyres';
  return raw.charAt(0).toUpperCase() + raw.slice(1);
}

export function getJobTyreLines(job: Pick<JobSummary, 'tyreLines' | 'tyreSizeDisplay' | 'quantity'> | null | undefined): JobTyreLine[] {
  if (!job) return [];
  if (Array.isArray(job.tyreLines) && job.tyreLines.length > 0) {
    return job.tyreLines.filter((line) => line.size && quantityValue(line.quantity) != null);
  }
  const quantity = quantityValue(job.quantity);
  if (!job.tyreSizeDisplay || quantity == null) return [];
  return [{ size: job.tyreSizeDisplay, quantity }];
}

export function totalJobTyreQuantity(job: Pick<JobSummary, 'tyreLines' | 'tyreSizeDisplay' | 'quantity'> | null | undefined): number {
  return getJobTyreLines(job).reduce((sum, line) => sum + (quantityValue(line.quantity) ?? 0), 0);
}

export function hasJobTyreDetails(job: Pick<JobSummary, 'tyreLines' | 'tyreSizeDisplay' | 'quantity'> | null | undefined): boolean {
  return getJobTyreLines(job).length > 0;
}

export function formatJobTyreLine(line: JobTyreLine): string {
  const pieces: string[] = [];
  const axle = axleLabel(line.axle);
  if (axle) pieces.push(`${axle}:`);
  pieces.push(line.size);

  const loadSpeed = `${line.loadIndex ?? ''}${line.speedIndex ?? ''}`.trim();
  if (loadSpeed) pieces.push(loadSpeed);
  if (line.runFlat === true) pieces.push('run-flat');
  if (line.xl === true) pieces.push('XL');
  if (line.commercial === true && !/C$/i.test(line.size)) pieces.push('commercial');

  const product = [line.brand, line.pattern].filter(Boolean).join(' ').trim();
  if (product) pieces.push(`- ${product}`);
  pieces.push(`x${quantityValue(line.quantity) ?? 1}`);
  return pieces.join(' ');
}

export function formatJobTyreLinesSummary(
  job: Pick<JobSummary, 'tyreLines' | 'tyreSizeDisplay' | 'quantity'> | null | undefined,
): string | null {
  const lines = getJobTyreLines(job);
  return lines.length > 0 ? lines.map(formatJobTyreLine).join(', ') : null;
}
