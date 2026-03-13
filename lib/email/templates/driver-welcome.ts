import { baseEmailTemplate } from './base';

export interface DriverWelcomeData {
  name: string;
  email: string;
  password: string;
  portalUrl: string;
}

export function driverWelcome(data: DriverWelcomeData): { subject: string; html: string } {
  const { name, email, password, portalUrl } = data;

  const content = `
    <h1>Welcome to Tyre Rescue</h1>
    <p>Hi ${name},</p>
    <p>Your driver account has been created. You can now access the driver portal to manage your jobs and availability.</p>
    
    <h2>Your Login Credentials</h2>
    <div class="info-box">
      <div class="info-row">
        <span class="label">Email</span>
        <span class="value">${email}</span>
      </div>
      <div class="info-row">
        <span class="label">Password</span>
        <span class="value" style="font-family: monospace;">${password}</span>
      </div>
    </div>

    <div style="text-align: center; margin: 32px 0;">
      <a href="${portalUrl}" class="button">Access Driver Portal</a>
    </div>

    <div class="info-box" style="background-color: #fff3cd;">
      <p style="margin: 0; font-size: 14px;"><strong>Important:</strong> Please change your password on first login. Go to Profile and Change Password in the driver portal.</p>
    </div>

    <h2>Getting Started</h2>
    <p>Once logged in, you can:</p>
    <ul>
      <li>Set your availability status (online/offline)</li>
      <li>View assigned jobs and job details</li>
      <li>Update job status as you progress</li>
      <li>Access customer locations and contact details</li>
    </ul>

    <p>If you have any questions, please contact the admin team or call 0141 266 0690.</p>
  `;

  return {
    subject: 'Your Tyre Rescue Driver Account',
    html: baseEmailTemplate({
      preheader: 'Your Tyre Rescue driver account has been created',
      content,
    }),
  };
}
