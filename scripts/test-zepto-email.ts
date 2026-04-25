/**
 * Send a test email via ZeptoMail.
 * Usage: npx tsx scripts/test-zepto-email.ts [recipient@example.com]
 */
import { config as loadEnv } from 'dotenv';
import path from 'node:path';

// Load env (prefer .env.local, fall back to .env.production)
loadEnv({ path: path.resolve(process.cwd(), '.env.local') });
loadEnv({ path: path.resolve(process.cwd(), '.env.production') });

console.log('ZEPTOMAIL_API_KEY length:', (process.env.ZEPTOMAIL_API_KEY ?? '').length);
console.log('ZEPTOMAIL_FROM_EMAIL:', process.env.ZEPTOMAIL_FROM_EMAIL);
console.log('ZEPTOMAIL_API_URL:', process.env.ZEPTOMAIL_API_URL);

async function main() {
  // Dynamic import so env vars are loaded before module evaluation
  const { ZeptoMailProvider } = await import('../lib/email/providers/zeptomail');

  const recipient = process.argv[2] ?? 'ahmadalwakai76@gmail.com';

  // Also do a raw fetch first to surface the full error body if any
  const rawKey = (process.env.ZEPTOMAIL_API_KEY ?? '').trim().replace(/^Zoho-enczapikey\s+/i, '');
  const rawRes = await fetch(process.env.ZEPTOMAIL_API_URL!, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: `Zoho-enczapikey ${rawKey}`,
    },
    body: JSON.stringify({
      from: { address: process.env.ZEPTOMAIL_FROM_EMAIL, name: 'Tyre Rescue' },
      to: [{ email_address: { address: recipient } }],
      subject: 'ZeptoMail raw probe',
      htmlbody: '<p>raw probe</p>',
    }),
  });
  console.log('Raw probe status:', rawRes.status);
  console.log('Raw probe body:', await rawRes.text());
  const provider = new ZeptoMailProvider();

  console.log(`Sending test email to ${recipient}...`);
  const timestamp = new Date().toISOString();

  const result = await provider.send({
    to: recipient,
    subject: `Tyre Rescue — ZeptoMail test (${timestamp})`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; padding: 24px; max-width: 560px; margin: 0 auto;">
        <h1 style="color: #111;">ZeptoMail Test</h1>
        <p>This is a test email from the Tyre Rescue platform.</p>
        <p><strong>Sent at:</strong> ${timestamp}</p>
        <p style="color: #666; font-size: 12px;">If you received this, ZeptoMail is configured correctly.</p>
      </div>
    `,
    text: `ZeptoMail Test\n\nThis is a test email from the Tyre Rescue platform.\nSent at: ${timestamp}`,
  });

  console.log('Result:', JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}

main().catch((err) => {
  console.error('Unhandled error:', err);
  process.exit(1);
});
