import { Resend } from 'resend';

interface BookingEmailInput {
  refNumber: string;
  externalReference: string;
  customerName: string;
  customerEmail: string;
  customerPhone: string;
  serviceLabel: string;
  addressLine: string;
  totalAmount: number;
}

function money(value: number): string {
  return new Intl.NumberFormat('en-GB', {
    style: 'currency',
    currency: 'GBP',
  }).format(value);
}

export async function sendBookingEmail(input: BookingEmailInput): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.ADMIN_EMAIL;

  if (!apiKey || !from) return;

  const resend = new Resend(apiKey);
  const subject = `Booking received ${input.refNumber}`;
  const html = `
    <div style="font-family:Arial,sans-serif;color:#13202b;line-height:1.5">
      <h1 style="margin:0 0 12px">Booking received</h1>
      <p>Reference <strong>${input.refNumber}</strong> has been created.</p>
      <table style="border-collapse:collapse;margin-top:16px">
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Request ref</td><td>${input.externalReference}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Customer</td><td>${input.customerName}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Phone</td><td>${input.customerPhone}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Service</td><td>${input.serviceLabel}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Location</td><td>${input.addressLine}</td></tr>
        <tr><td style="padding:4px 16px 4px 0;color:#506070">Estimate</td><td>${money(input.totalAmount)}</td></tr>
      </table>
      <p style="margin-top:18px">Please complete secure card checkout to confirm the visit. We will contact you if anything needs checking.</p>
    </div>
  `;

  await resend.emails.send({
    from,
    to: input.customerEmail,
    bcc: adminEmail || undefined,
    subject,
    html,
  });
}
