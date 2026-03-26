export interface AdminAlertTemplateField {
  label: string;
  value: string;
}

export interface AdminAlertTemplateInput {
  heading: string;
  eventType: string;
  actionSummary: string;
  occurredAt: string;
  related: AdminAlertTemplateField[];
  ctaLabel: string;
  ctaUrl: string;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function renderRelatedRows(fields: AdminAlertTemplateField[]): string {
  if (fields.length === 0) {
    return '<p style="margin:0;color:#4b5563;font-size:14px;line-height:1.5;">No additional details were provided.</p>';
  }

  return fields
    .map((field) => {
      const label = escapeHtml(field.label);
      const value = escapeHtml(field.value);
      return `
        <tr>
          <td style="padding:8px 0;color:#6b7280;font-size:13px;vertical-align:top;width:38%;">${label}</td>
          <td style="padding:8px 0;color:#111827;font-size:13px;font-weight:600;vertical-align:top;">${value}</td>
        </tr>
      `;
    })
    .join('');
}

export function buildAdminAlertEmailTemplate(input: AdminAlertTemplateInput): {
  html: string;
  text: string;
} {
  const heading = escapeHtml(input.heading);
  const eventType = escapeHtml(input.eventType);
  const actionSummary = escapeHtml(input.actionSummary);
  const occurredAt = escapeHtml(input.occurredAt);
  const ctaLabel = escapeHtml(input.ctaLabel);
  const ctaUrl = escapeHtml(input.ctaUrl);
  const relatedRows = renderRelatedRows(input.related);

  const html = `
<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>${heading}</title>
  </head>
  <body style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f3f4f6;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e5e7eb;">
            <tr>
              <td style="padding:24px 24px 14px 24px;background:#111827;color:#f9fafb;">
                <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.08em;text-transform:uppercase;color:#d1d5db;">Tyre Rescue Admin Alert</p>
                <h1 style="margin:0;font-size:24px;line-height:1.3;font-weight:700;">${heading}</h1>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 0 24px;">
                <div style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#f9fafb;">
                  <p style="margin:0 0 8px 0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Action Summary</p>
                  <p style="margin:0;font-size:15px;line-height:1.5;color:#111827;font-weight:600;">${actionSummary}</p>
                </div>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 0 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#ffffff;">
                  <tr>
                    <td style="padding:0 0 8px 0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Event</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 12px 0;color:#111827;font-size:14px;font-weight:600;">${eventType}</td>
                  </tr>
                  <tr>
                    <td style="padding:0 0 8px 0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Occurred At</td>
                  </tr>
                  <tr>
                    <td style="padding:0;color:#111827;font-size:14px;font-weight:600;">${occurredAt}</td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 24px 0 24px;">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border:1px solid #e5e7eb;border-radius:10px;padding:14px 16px;background:#ffffff;">
                  <tr>
                    <td style="padding:0 0 8px 0;font-size:12px;letter-spacing:0.06em;text-transform:uppercase;color:#6b7280;">Related Details</td>
                  </tr>
                  ${relatedRows}
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:20px 24px 24px 24px;">
                <a href="${ctaUrl}" style="display:inline-block;background:#111827;color:#ffffff;text-decoration:none;padding:12px 18px;border-radius:8px;font-size:14px;font-weight:600;">${ctaLabel}</a>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>
  `.trim();

  const lines: string[] = [
    `Tyre Rescue Admin Alert: ${input.heading}`,
    '',
    `Action Summary: ${input.actionSummary}`,
    `Event: ${input.eventType}`,
    `Occurred At: ${input.occurredAt}`,
  ];

  if (input.related.length > 0) {
    lines.push('', 'Related Details:');
    for (const field of input.related) {
      lines.push(`- ${field.label}: ${field.value}`);
    }
  }

  lines.push('', `Open in Admin: ${input.ctaUrl}`);

  return {
    html,
    text: lines.join('\n'),
  };
}
