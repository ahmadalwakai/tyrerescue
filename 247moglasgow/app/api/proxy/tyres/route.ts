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

export async function GET(request: Request) {
  const incoming = new URL(request.url);
  const target = new URL('/api/tyres', TYRE_RESCUE_BASE);

  for (const key of ['width', 'aspect', 'rim', 'limit']) {
    const value = incoming.searchParams.get(key);
    if (value) target.searchParams.set(key, value);
  }

  try {
    const response = await fetch(target, { cache: 'no-store' });
    return proxyResponse(response);
  } catch {
    return Response.json({ error: 'Tyre catalogue is unavailable' }, { status: 502 });
  }
}
