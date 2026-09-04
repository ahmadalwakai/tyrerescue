const VOICE = 'Polly.Amy-Neural';
const LANGUAGE = 'en-GB';

function escapeXml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function twimlGather(options: {
  text: string;
  actionUrl: string;
  hints?: string;
  timeout?: number;
  fallbackText?: string;
}): string {
  const timeout = options.timeout ?? 8;
  const hints = options.hints
    ? ` hints="${escapeXml(options.hints)}"`
    : '';
  const fallback = options.fallbackText
    ? `<Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(options.fallbackText)}</Say>`
    : `<Say voice="${VOICE}" language="${LANGUAGE}">I'm sorry, I didn't catch that. Let me transfer you to our team.</Say>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Gather input="speech" action="${escapeXml(options.actionUrl)}" timeout="${timeout}" speechTimeout="auto" language="${LANGUAGE}"${hints}>
    <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(options.text)}</Say>
  </Gather>
  ${fallback}
  <Hangup/>
</Response>`;
}

export function twimlSay(text: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(text)}</Say>
  <Hangup/>
</Response>`;
}

export function twimlTransfer(text: string, toNumber: string): string {
  return `<?xml version="1.0" encoding="UTF-8"?>
<Response>
  <Say voice="${VOICE}" language="${LANGUAGE}">${escapeXml(text)}</Say>
  <Dial>${escapeXml(toNumber)}</Dial>
</Response>`;
}

export function twimlXmlResponse(twiml: string): Response {
  return new Response(twiml, {
    status: 200,
    headers: { 'Content-Type': 'text/xml; charset=utf-8' },
  });
}
