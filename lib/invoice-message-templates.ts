/**
 * Invoice Message Templates
 *
 * Templates for sharing invoices via WhatsApp, Email, and copy-to-clipboard.
 * Follows the same pattern as quick-book-message-templates.ts.
 */

export interface InvoiceMessageContext {
  customerName: string;
  invoiceNumber: string;
  totalAmount: number;
  bookingRef?: string | null;
  invoiceUrl?: string | null;
}

function getFirstName(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0] || 'there';
}

function formatCurrency(amount: number): string {
  return `£${amount.toFixed(2)}`;
}

/**
 * WhatsApp message template for invoice sharing
 */
export function buildInvoiceWhatsAppMessage(ctx: InvoiceMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const total = formatCurrency(ctx.totalAmount);
  const bookingLine = ctx.bookingRef ? `\nBooking Ref: ${ctx.bookingRef}` : '';
  const linkLine = ctx.invoiceUrl ? `\n\n📄 View your invoice:\n${ctx.invoiceUrl}` : '';

  return `Hi ${firstName} 👋

This is Tyre Rescue. Here are the details of your invoice:

📋 Invoice: ${ctx.invoiceNumber}${bookingLine}
💷 Total: ${total}${linkLine}

If you have any questions, just reply to this message or call us on 0141 266 0690.

Thanks,
Tyre Rescue 🛞`;
}

/**
 * Email subject for invoice sharing
 */
export function buildInvoiceEmailSubject(ctx: InvoiceMessageContext): string {
  return `Invoice ${ctx.invoiceNumber} from Tyre Rescue`;
}

/**
 * Plain-text email body for invoice sharing (used as text alternative)
 */
export function buildInvoiceEmailBody(ctx: InvoiceMessageContext): string {
  const firstName = getFirstName(ctx.customerName);
  const total = formatCurrency(ctx.totalAmount);
  const bookingLine = ctx.bookingRef ? `Booking Ref: ${ctx.bookingRef}\n` : '';
  const linkLine = ctx.invoiceUrl ? `\nView your invoice online:\n${ctx.invoiceUrl}\n` : '';

  return `Hi ${firstName},

Please find your invoice from Tyre Rescue.

Invoice Number: ${ctx.invoiceNumber}
${bookingLine}Total Due: ${total}
${linkLine}
A PDF copy of the invoice is attached to this email. If you have any questions, please call us on 0141 266 0690.

Thanks,
The Tyre Rescue Team

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📞 0141 266 0690
🌐 www.tyrerescue.uk
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`;
}
