/**
 * Base email template wrapper
 * All emails use this consistent layout
 */

export interface BaseEmailProps {
  preheader?: string;
  content: string;
  isMarketing?: boolean;
  siteUrl?: string;
}

export function baseEmailTemplate({ preheader, content, isMarketing = false, siteUrl }: BaseEmailProps): string {
  const url = siteUrl || process.env.NEXTAUTH_URL || 'https://www.tyrerescue.uk';
  
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Tyre Rescue</title>
  ${preheader ? `<span style="display:none;font-size:1px;color:#ffffff;line-height:1px;max-height:0px;max-width:0px;opacity:0;overflow:hidden;">${preheader}</span>` : ''}
  <style>
    body {
      margin: 0;
      padding: 0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 16px;
      line-height: 1.6;
      color: #1a1a1a;
      background-color: #f5f5f5;
    }
    .container {
      max-width: 600px;
      margin: 0 auto;
      background-color: #ffffff;
    }
    .header {
      padding: 32px 24px;
      text-align: center;
      border-bottom: 1px solid #e5e5e5;
    }
    .logo {
      font-size: 28px;
      font-weight: bold;
      color: #1a1a1a;
      text-decoration: none;
      display: block;
      margin-bottom: 8px;
    }
    .tagline {
      font-size: 14px;
      color: #666666;
      margin-bottom: 8px;
    }
    .header-contact {
      font-size: 12px;
      color: #888888;
      line-height: 1.4;
    }
    .content {
      padding: 32px 24px;
    }
    .footer {
      padding: 24px;
      text-align: center;
      font-size: 12px;
      color: #666666;
      background-color: #f9f9f9;
      border-top: 1px solid #e5e5e5;
    }
    .footer p {
      margin: 4px 0;
    }
    .footer-links {
      margin-top: 16px;
    }
    .footer-links a {
      color: #666666;
      text-decoration: underline;
    }
    .disclaimer {
      margin-top: 16px;
      font-size: 11px;
      color: #999999;
    }
    .button {
      display: inline-block;
      padding: 14px 28px;
      background-color: #1a1a1a;
      color: #ffffff !important;
      text-decoration: none;
      border-radius: 6px;
      font-weight: 600;
      margin: 16px 0;
    }
    .button:hover {
      background-color: #333333;
    }
    h1 {
      font-size: 24px;
      font-weight: bold;
      margin: 0 0 16px 0;
    }
    h2 {
      font-size: 20px;
      font-weight: 600;
      margin: 24px 0 12px 0;
    }
    p {
      margin: 0 0 16px 0;
    }
    .info-box {
      background-color: #f9f9f9;
      padding: 16px;
      border-radius: 6px;
      margin: 16px 0;
    }
    .info-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e5e5;
    }
    .info-row:last-child {
      border-bottom: none;
    }
    .label {
      color: #666666;
      font-size: 14px;
    }
    .value {
      font-weight: 600;
    }
    .total-row {
      font-size: 18px;
      font-weight: bold;
      padding-top: 12px;
      margin-top: 4px;
      border-top: 2px solid #1a1a1a;
    }
    table {
      width: 100%;
      border-collapse: collapse;
    }
    th, td {
      padding: 10px;
      text-align: left;
      border-bottom: 1px solid #e5e5e5;
    }
    th {
      font-weight: 600;
      color: #666666;
      font-size: 12px;
      text-transform: uppercase;
    }
  </style>
</head>
<body>
  <div class="container">
    <div style="text-align: center; padding: 24px 40px 20px; background-color: #09090B; border-bottom: 2px solid #F97316;">
      <img
        src="https://www.tyrerescue.uk/logo.svg"
        alt="Tyre Rescue"
        width="160"
        height="48"
        style="display: block; margin: 0 auto;"
      />
      <div style="font-size: 14px; color: #A1A1AA; margin-top: 8px;">Emergency Mobile Tyre Fitting</div>
      <div style="font-size: 12px; color: #888888; margin-top: 4px; line-height: 1.4;">
        3, 10 Gateside St, Glasgow G31 1PD<br>
        0141 266 0690
      </div>
    </div>
    <div class="content">
      ${content}
    </div>
    <div class="footer">
      <p><strong>Tyre Rescue</strong></p>
      <p>3, 10 Gateside St, Glasgow G31 1PD</p>
      <p>Phone: 0141 266 0690</p>
      <p>Open: 8am to Midnight, Every Day</p>
      <div class="footer-links">
        <a href="${url}/privacy-policy">Privacy Policy</a> |
        <a href="${url}/terms-of-service">Terms of Service</a>
      </div>
      ${isMarketing ? `
      <div class="disclaimer">
        You are receiving this email because you subscribed to marketing communications from Tyre Rescue.
        <br><a href="${url}/unsubscribe" style="color: #999999;">Unsubscribe</a>
      </div>
      ` : ''}
      <div class="disclaimer">
        This email and any attachments are confidential and intended solely for the addressee.
        If you have received this email in error, please delete it and notify us immediately.
      </div>
    </div>
  </div>
</body>
</html>
  `.trim();
}
