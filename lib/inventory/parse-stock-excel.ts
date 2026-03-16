export interface ParsedStockItem {
  width: number;
  aspect: number;
  rim: number;
  quantity: number;
  itemCode: string;
  itemName: string;
}

export function parseItemCode(code: string): {
  width: number;
  aspect: number;
  rim: number;
} | null {
  const match = code.match(/^(\d{3})(\d{2})(\d{2})c?$/i);
  if (!match) return null;
  return {
    width: Number(match[1]),
    aspect: Number(match[2]),
    rim: Number(match[3]),
  };
}

export function parseStockExcel(buffer: Buffer): ParsedStockItem[] {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx');
  const workbook = XLSX.read(buffer, { type: 'buffer' });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    defval: '',
  }) as string[][];

  const items: ParsedStockItem[] = [];

  for (const row of rows) {
    const itemCode = String(row[0] || '').trim();
    const itemName = itemCode;
    const quantity = parseInt(String(row[2] || '0'));

    if (!itemCode || isNaN(quantity)) continue;

    const parsed = parseItemCode(itemCode);
    if (!parsed) continue;

    items.push({
      ...parsed,
      quantity,
      itemCode,
      itemName,
    });
  }

  return items;
}
