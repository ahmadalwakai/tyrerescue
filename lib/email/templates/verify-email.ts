import { baseEmailTemplate } from './base';

export interface VerifyEmailData {
  name: string;
  verifyUrl: string;
}

export function verifyEmail(data: VerifyEmailData): { subject: string; html: string } {
  const { name, verifyUrl } = data;

  const content = `
    <h1>Verify Your Email Address</h1>
    <p>Hi ${name},</p>
    <p>Please verify your email address by clicking the button below:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${verifyUrl}" class="button">Verify Email Address</a>
    </div>

    <p style="font-size: 14px; color: #666666;">This verification link will expire in 24 hours.</p>
    
    <p style="font-size: 14px; color: #666666;">If you did not create an account with Tyre Rescue, please ignore this email.</p>

    <p>If you are having trouble clicking the button, copy and paste the following link into your browser:</p>
    <p style="font-size: 12px; word-break: break-all; color: #666666;">${verifyUrl}</p>
  `;

  return {
    subject: 'Verify your email address',
    html: baseEmailTemplate({
      preheader: 'Verify your Tyre Rescue account email address',
      content,
    }),
  };
}
