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

export async function GET() {
  try {
    const response = await fetch(new URL('/api/tyres/popular-sizes', TYRE_RESCUE_BASE), { cache: 'no-store' });
    return proxyResponse(response);
  } catch {
    return Response.json({ error: 'Popular tyre sizes are unavailable' }, { status: 502 });
  }
}
