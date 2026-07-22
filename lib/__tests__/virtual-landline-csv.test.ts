import { describe, expect, it } from 'vitest';
import { readFileSync } from 'fs';
import { join } from 'path';
import {
  escapeSpreadsheetFormula,
  parseVirtualLandlineDateTime,
  parseVirtualLandlineDurationSeconds,
  parseVirtualLandlineCsv,
  summarizeVirtualLandlineImportOutcome,
  validateRecordingUrl,
} from '@/lib/virtual-landline/csv';

const sanitizedFixture = readFileSync(
  join(process.cwd(), 'lib/__fixtures__/virtual-landline-call-history-sanitized.csv'),
  'utf8',
);
const providerSanitizedFixture = readFileSync(
  join(process.cwd(), 'lib/__fixtures__/virtual-landline-provider-call-history-sanitized.csv'),
  'utf8',
);

describe('Virtual Landline CSV parser', () => {
  it('parses a valid call-history CSV with detected columns', () => {
    const csv = [
      'Call ID,Caller Number,Destination Number,Direction,Start Time,Duration,Call Status,Recording URL',
      'vl-1,07901 846297,01412660690,Incoming,21/07/2026 03:17:50,00:02:10,Answered,https://recordings.example/call-1.mp3',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(parsed.detectedColumns).toMatchObject({
      callerNumber: 'Caller Number',
      destinationNumber: 'Destination Number',
      startTime: 'Start Time',
      recordingUrl: 'Recording URL',
    });
    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]).toMatchObject({
      direction: 'incoming',
      customerPhoneNormalized: '447901846297',
      durationSeconds: 130,
      recordingUrl: 'https://recordings.example/call-1.mp3',
    });
    expect(parsed.invalidRows).toHaveLength(0);
    expect(parsed.counts).toMatchObject({
      incoming: 1,
      recordingRows: 1,
      withheldRows: 0,
    });
  });

  it('parses the sanitized provider-shaped fixture without exposing personal data', () => {
    const parsed = parseVirtualLandlineCsv(sanitizedFixture);

    expect(parsed.headers).toEqual([
      'Call ID',
      'Caller Number',
      'Destination Number',
      'Direction',
      'Start Time',
      'End Time',
      'Duration',
      'Call Status',
      'Recording URL',
      'Notes',
    ]);
    expect(parsed.totalRows).toBe(5);
    expect(parsed.calls).toHaveLength(3);
    expect(parsed.invalidRows).toHaveLength(2);
    expect(parsed.warningRows).toHaveLength(1);
    expect(parsed.counts).toMatchObject({
      incoming: 2,
      outgoing: 1,
      missed: 0,
      recordingRows: 1,
      withheldRows: 2,
    });
    expect(sanitizedFixture).not.toMatch(/07901|01412660690|ahmad/i);
  });

  it('parses the real Virtual Landline export shape with metadata rows and Excel-safe phone literals', () => {
    const parsed = parseVirtualLandlineCsv(providerSanitizedFixture);

    expect(parsed.headers).toEqual([
      'Caller Number',
      'Called Number',
      'Incoming/Outgoing',
      'Call Date',
      'Duration (mins:secs)',
      'Cost (GBP)',
    ]);
    expect(parsed.detectedColumns).toMatchObject({
      callerNumber: 'Caller Number',
      destinationNumber: 'Called Number',
      direction: 'Incoming/Outgoing',
      date: 'Call Date',
      duration: 'Duration (mins:secs)',
    });
    expect(parsed.totalRows).toBe(5);
    expect(parsed.calls).toHaveLength(4);
    expect(parsed.invalidRows).toHaveLength(1);
    expect(parsed.calls.map((call) => call.direction)).toEqual(['incoming', 'outgoing', 'missed', 'outgoing']);
    expect(parsed.calls.map((call) => call.durationSeconds)).toEqual([109, 1, 0, 26]);
    expect(parsed.calls[0]?.startedAt.toISOString()).toBe('2026-07-22T14:41:00.000Z');
    expect(parsed.counts).toMatchObject({
      incoming: 1,
      outgoing: 2,
      missed: 1,
      recordingRows: 0,
      withheldRows: 1,
    });
    expect(providerSanitizedFixture).not.toMatch(/01412660690|07901|ahmad/i);
  });

  it('reports unknown columns as invalid rows instead of importing blindly', () => {
    const parsed = parseVirtualLandlineCsv('Something,Else\nabc,def');

    expect(parsed.calls).toHaveLength(0);
    expect(parsed.invalidRows[0]?.reason).toMatch(/start time/i);
  });

  it('rejects malformed quoted CSV safely', () => {
    expect(() => parseVirtualLandlineCsv('Caller Number,Start Time\n"07901846297,21/07/2026')).toThrow(
      /unterminated/i,
    );
  });

  it('deduplicates repeated calls by stable provider call id', () => {
    const csv = [
      'Call ID,Caller,Direction,Start Time,Duration,Status',
      'same-id,07901846297,Incoming,21/07/2026 01:00:00,20,Answered',
      'same-id,07901846297,Incoming,21/07/2026 01:00:00,20,Answered',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.duplicateRows).toHaveLength(1);
  });

  it('normalizes UK mobile and landline numbers for matching', () => {
    const csv = [
      'From,To,Type,Date,Time,Length,Result',
      '07901 846297,0141 266 0690,Incoming,21/07/2026,03:17,75,Answered',
      '+44 141 266 0690,07901846297,Outgoing,21/07/2026,03:20,83,Answered',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(parsed.calls.map((call) => call.customerPhoneNormalized)).toEqual([
      '447901846297',
      '447901846297',
    ]);
  });

  it('does not create customer matches from withheld, private, international or internal caller IDs', () => {
    const csv = [
      'Caller Number,Destination Number,Direction,Start Time,Duration,Call Status',
      'Withheld,02079460000,Incoming,21/07/2026 03:00:00,0,Missed',
      'anonymous,02079460000,Incoming,21/07/2026 03:01:00,0,Missed',
      '+33123456789,02079460000,Incoming,21/07/2026 03:02:00,20,Answered',
      '1234,02079460000,Incoming,21/07/2026 03:03:00,20,Answered',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(parsed.calls).toHaveLength(0);
    expect(parsed.invalidRows).toHaveLength(4);
    expect(parsed.counts.withheldRows).toBe(2);
  });

  it('maps missed, incoming and outgoing rows from direction/status fields', () => {
    const csv = [
      'Caller Number,Destination Number,Direction,Start Time,Duration,Call Status',
      '07901846297,01412660690,Incoming,21/07/2026 03:00:00,0,Missed',
      '01412660690,07901846297,Outgoing,21/07/2026 03:02:00,30,Answered',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(parsed.calls[0]?.direction).toBe('missed');
    expect(parsed.calls[1]?.direction).toBe('outgoing');
  });

  it('keeps only valid http or https recording URLs', () => {
    expect(validateRecordingUrl('https://example.test/recording.wav')).toBe('https://example.test/recording.wav');
    expect(validateRecordingUrl('ftp://example.test/recording.wav')).toBeNull();
    expect(validateRecordingUrl('javascript:alert(1)')).toBeNull();
  });

  it('ignores malformed recording URLs while warning the admin preview', () => {
    const parsed = parseVirtualLandlineCsv(
      'Caller Number,Start Time,Recording URL\n07700 900111,21/07/2026 03:17:50,javascript:alert(1)',
    );

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]?.recordingUrl).toBeNull();
    expect(parsed.warningRows[0]?.reason).toMatch(/recording/i);
  });

  it('supports semicolon delimiters and quoted fields', () => {
    const parsed = parseVirtualLandlineCsv(
      'Call ID;Caller Number;Start Time;Duration;Call Status;Notes\n"semi-1";"07700 900111";"21/07/2026 03:17:50";"01:05";"Answered";"quoted; note"',
    );

    expect(parsed.calls).toHaveLength(1);
    expect(parsed.calls[0]?.durationSeconds).toBe(65);
    expect(parsed.calls[0]?.rawRow.Notes).toBe('quoted; note');
  });

  it('parses UK local timestamps instead of silently assuming UTC', () => {
    expect(parseVirtualLandlineDateTime('21/07/2026 03:17:50')?.toISOString()).toBe('2026-07-21T02:17:50.000Z');
    expect(parseVirtualLandlineDateTime('21/01/2026 03:17:50')?.toISOString()).toBe('2026-01-21T03:17:50.000Z');
    expect(parseVirtualLandlineDateTime('2026-07-21T03:17:50+01:00')?.toISOString()).toBe('2026-07-21T02:17:50.000Z');
  });

  it('handles BST/GMT transition boundaries explicitly', () => {
    expect(parseVirtualLandlineDateTime('31/03/2024 00:30:00')?.toISOString()).toBe('2024-03-31T00:30:00.000Z');
    expect(parseVirtualLandlineDateTime('31/03/2024 02:30:00')?.toISOString()).toBe('2024-03-31T01:30:00.000Z');
    expect(parseVirtualLandlineDateTime('31/03/2024 01:30:00')).toBeNull();
    expect(parseVirtualLandlineDateTime('27/10/2024 01:30:00')?.toISOString()).toBe('2024-10-27T00:30:00.000Z');
  });

  it('parses valid durations and rejects impossible durations', () => {
    expect(parseVirtualLandlineDurationSeconds('83 seconds')).toBe(83);
    expect(parseVirtualLandlineDurationSeconds('01:02:03')).toBe(3723);
    expect(parseVirtualLandlineDurationSeconds('02:03')).toBe(123);
    expect(parseVirtualLandlineDurationSeconds('')).toBeNull();
    expect(parseVirtualLandlineDurationSeconds('0')).toBe(0);
    expect(parseVirtualLandlineDurationSeconds('-1')).toBeNull();
    expect(parseVirtualLandlineDurationSeconds('01:99')).toBeNull();
    expect(parseVirtualLandlineDurationSeconds('01:02:99')).toBeNull();
  });

  it('summarizes duplicate concurrent inserts from database-returned rows', () => {
    const parsed = parseVirtualLandlineCsv([
      'Call ID,Caller Number,Direction,Start Time,Duration,Call Status',
      'concurrent-1,07700 900111,Incoming,21/07/2026 03:00:00,20,Answered',
      'concurrent-2,07700 900222,Missed,21/07/2026 03:01:00,0,Missed',
    ].join('\n'));

    const first = summarizeVirtualLandlineImportOutcome(parsed, [
      { direction: 'incoming' },
      { direction: 'missed' },
    ]);
    const duplicate = summarizeVirtualLandlineImportOutcome(parsed, []);

    expect(first).toMatchObject({ imported: 2, duplicate: 0, missedCalls: 1 });
    expect(duplicate).toMatchObject({ imported: 0, duplicate: 2, missedCalls: 0 });
  });

  it('escapes spreadsheet-formula values in stored raw rows', () => {
    const csv = [
      'Caller Number,Start Time,Status',
      '07901846297,21/07/2026 03:17:50,=HYPERLINK("https://bad.example")',
    ].join('\n');

    const parsed = parseVirtualLandlineCsv(csv);

    expect(escapeSpreadsheetFormula('@cmd')).toBe("'@cmd");
    expect(parsed.calls[0]?.rawRow.Status).toMatch(/^'/);
  });
});
