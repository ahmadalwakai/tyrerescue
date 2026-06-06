/* ── Zyphon – Invoice Parser (Phase 3) ────────────────── */

import { db } from '@/lib/db';
import { invoices, invoiceItems } from '@/lib/db/schema';
import { ilike, count } from 'drizzle-orm';
import type { InvoicePreviewData } from './types';

/* ── Company defaults (shared constant) ───────────────── */

export const COMPANY = {
  name: 'Tyre Rescue',
  address: '3, 10 Gateside St, Glasgow G31 1PD',
  phone: '0141 266 0690',
  email: 'support@tyrerescue.uk',
};

/* ── Invoice number generation (reuse pattern from admin/invoices route) ── */

export async function generateInvoiceNumber(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `INV-${year}-`;
  const [result] = await db
    .select({ cnt: count() })
    .from(invoices)
    .where(ilike(invoices.invoiceNumber, `${prefix}%`));
  const next = (result?.cnt ?? 0) + 1;
  return `${prefix}${String(next).padStart(4, '0')}`;
}

/* ── VAT disabled for live system ────────────────────── */

export async function getVatRate(): Promise<number> {
  return 0;
}

/* ── Parsed invoice input ────────────────────────────── */

export interface ParsedInvoiceInput {
  customerName: string;
  customerEmail?: string;
  customerPhone?: string;
  customerAddress?: string;
  items: { description: string; quantity: number; unitPrice: number }[];
  notes?: string;
  dueDate?: string;
  bookingId?: string;
}

/* ── Build preview from parsed input ─────────────────── */

export async function buildInvoicePreview(
  input: ParsedInvoiceInput,
): Promise<InvoicePreviewData> {
  const vatRate = await getVatRate();
  const invoiceNumber = await generateInvoiceNumber();

  const items = input.items.map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    totalPrice: item.quantity * item.unitPrice,
  }));

  const subtotal = items.reduce((sum, i) => sum + i.totalPrice, 0);
  const vatAmount = 0;
  const totalAmount = Math.round(subtotal * 100) / 100;

  const dueDate = input.dueDate || defaultDueDate();

  return {
    invoiceNumber,
    customerName: input.customerName,
    customerEmail: input.customerEmail,
    items,
    subtotal,
    vatRate,
    vatAmount,
    totalAmount,
    notes: input.notes,
    dueDate,
    status: 'draft',
  };
}

/* ── Persist draft invoice to DB ─────────────────────── */

export async function persistInvoiceDraft(
  preview: InvoicePreviewData,
  input: ParsedInvoiceInput,
  userId: string,
): Promise<{ invoiceId: string; invoiceNumber: string }> {
  const now = new Date();
  const issueDate = now.toISOString().slice(0, 10);

  const [invoice] = await db
    .insert(invoices)
    .values({
      invoiceNumber: preview.invoiceNumber,
      bookingId: input.bookingId || null,
      status: 'draft',
      customerName: preview.customerName,
      customerEmail: input.customerEmail || '',
      customerPhone: input.customerPhone || null,
      customerAddress: input.customerAddress || null,
      companyName: COMPANY.name,
      companyAddress: COMPANY.address,
      companyPhone: COMPANY.phone,
      companyEmail: COMPANY.email,
      issueDate: new Date(issueDate),
      dueDate: new Date(preview.dueDate || defaultDueDate()),
      subtotal: String(preview.subtotal),
      vatRate: String(preview.vatRate),
      vatAmount: String(preview.vatAmount),
      totalAmount: String(preview.totalAmount),
      notes: preview.notes || null,
      createdBy: userId,
    })
    .returning({ id: invoices.id });

  // Insert line items
  for (let i = 0; i < preview.items.length; i++) {
    const item = preview.items[i];
    await db.insert(invoiceItems).values({
      invoiceId: invoice.id,
      description: item.description,
      quantity: item.quantity,
      unitPrice: String(item.unitPrice),
      totalPrice: String(item.totalPrice),
      sortOrder: i,
    });
  }

  return { invoiceId: invoice.id, invoiceNumber: preview.invoiceNumber };
}

/* ── Helpers ──────────────────────────────────────────── */

function defaultDueDate(): string {
  const d = new Date();
  d.setDate(d.getDate() + 14); // 14-day default
  return d.toISOString().slice(0, 10);
}
