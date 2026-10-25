const TYRE_RESCUE_BASE = 'https://www.tyrerescue.uk';

function proxyResponse(response: Response) {
  return response.text().then(
    (body) =>
      new Response(body, {
        status: response.status,
        statusText: response.statusText,
        headers: {
          'content-type': response.headers.get('content-type') ?? 'application/json',
        },
      }),
  );
}

export async function POST(request: Request) {
  const secret = process.env.MO_GLASGOW_INTEGRATION_SECRET?.trim();

  if (!secret) {
    return Response.json({ error: 'Booking integration is not configured' }, { status: 500 });
  }

  try {
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const response = await fetch(new URL('/api/bookings/quote', TYRE_RESCUE_BASE), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secret}`,
        'Content-Type': 'application/json',
        'x-integration-key': secret,
        'x-source-app': '247_mo_glasgow',
      },
      body: JSON.stringify({
        ...body,
        pricingOrigin: { sourceApp: '247_mo_glasgow' },
      }),
    });

    return proxyResponse(response);
  } catch {
    return Response.json({ error: 'Quote service is unavailable' }, { status: 502 });
  }
}
