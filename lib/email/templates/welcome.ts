import { baseEmailTemplate } from './base';

export interface WelcomeEmailData {
  name: string;
  verifyUrl: string;
}

export function welcome(data: WelcomeEmailData): { subject: string; html: string } {
  const { name, verifyUrl } = data;

  const content = `
    <h1>Welcome to Tyre Rescue</h1>
    <p>Hi ${name},</p>
    <p>Thank you for creating an account with Tyre Rescue. We provide 24-hour mobile tyre fitting services across Glasgow, Edinburgh, and surrounding areas.</p>
    
    <p>Please verify your email address to complete your registration:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
    </div>

    <p style="font-size: 14px; color: #666666;">This link will expire in 24 hours. If you did not create this account, you can safely ignore this email.</p>

    <h2>What you can do with your account:</h2>
    <ul>
      <li>Book emergency and scheduled tyre fittings</li>
      <li>Track your bookings in real-time</li>
      <li>View your booking history</li>
      <li>Download VAT invoices</li>
      <li>Save your vehicles and addresses</li>
    </ul>

    <p>If you need immediate assistance, call us on <strong>0141 266 0690</strong>.</p>
  `;

  return {
    subject: 'Welcome to Tyre Rescue',
    html: baseEmailTemplate({
      preheader: 'Welcome to Tyre Rescue - Verify your email address',
      content,
    }),
  };
}
