import { baseEmailTemplate } from './base';

export interface ResetPasswordData {
  name: string;
  resetUrl: string;
}

export function resetPassword(data: ResetPasswordData): { subject: string; html: string } {
  const { name, resetUrl } = data;

  const content = `
    <h1>Reset Your Password</h1>
    <p>Hi ${name},</p>
    <p>We received a request to reset your password. Click the button below to create a new password:</p>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${resetUrl}" class="button">Reset Password</a>
    </div>

    <div class="info-box">
      <p style="margin: 0; font-size: 14px; color: #666666;"><strong>Important:</strong></p>
      <ul style="margin: 8px 0 0 0; padding-left: 20px; color: #666666; font-size: 14px;">
        <li>This link will expire in 1 hour</li>
        <li>This link can only be used once</li>
        <li>If you did not request this, please ignore this email</li>
      </ul>
    </div>

    <p style="font-size: 14px; color: #666666;">If you are having trouble clicking the button, copy and paste the following link into your browser:</p>
    <p style="font-size: 12px; word-break: break-all; color: #666666;">${resetUrl}</p>

    <p>If you did not request a password reset, your account is secure and no action is needed.</p>
  `;

  return {
    subject: 'Reset your password',
    html: baseEmailTemplate({
      preheader: 'Reset your Tyre Rescue account password',
      content,
    }),
  };
}
