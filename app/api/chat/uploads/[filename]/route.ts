import { readFile, stat } from 'fs/promises';
import path from 'path';
import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const MIME_BY_EXTENSION: Record<string, string> = {
  aac: 'audio/aac',
  gif: 'image/gif',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  m4a: 'audio/mp4',
  mp3: 'audio/mpeg',
  ogg: 'audio/ogg',
  png: 'image/png',
  wav: 'audio/wav',
  webm: 'audio/webm',
  webp: 'image/webp',
  '3gp': 'audio/3gpp',
};

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
  'Access-Control-Allow-Headers': 'Range, Content-Type, Authorization',
  'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges',
};

type RouteContext = { params: Promise<{ filename: string }> };

function getMimeType(filename: string): string {
  const extension = path.extname(filename).replace('.', '').toLowerCase();
  return MIME_BY_EXTENSION[extension] ?? 'application/octet-stream';
}

function resolveUploadPath(filename: string): string | null {
  const basename = path.basename(filename);
  if (
    basename !== filename ||
    !/^[a-f0-9-]+\.(aac|gif|jpe?g|m4a|mp3|ogg|png|wav|webm|webp|3gp)$/i.test(basename)
  ) {
    return null;
  }
  return path.join(process.cwd(), 'public', 'uploads', 'chat-attachments', basename);
}

function parseRange(range: string | null, size: number): { start: number; end: number } | null {
  if (!range) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
  if (!match) return null;

  const [, startRaw, endRaw] = match;
  let start = startRaw ? Number.parseInt(startRaw, 10) : 0;
  let end = endRaw ? Number.parseInt(endRaw, 10) : size - 1;

  if (!startRaw && endRaw) {
    const suffixLength = Number.parseInt(endRaw, 10);
    start = Math.max(0, size - suffixLength);
    end = size - 1;
  }

  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start || start >= size) {
    return null;
  }

  return { start, end: Math.min(end, size - 1) };
}

async function serveLocalChatUpload(req: NextRequest, ctx: RouteContext, headOnly = false) {
  const { filename } = await ctx.params;
  const filePath = resolveUploadPath(filename);
  if (!filePath) {
    return NextResponse.json({ error: 'Invalid upload filename' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    const fileStat = await stat(filePath);
    const mimeType = getMimeType(filename);
    const range = parseRange(req.headers.get('range'), fileStat.size);
    const fullFile = await readFile(filePath);

    if (range) {
      const chunk = fullFile.subarray(range.start, range.end + 1);
      return new Response(headOnly ? null : chunk, {
        status: 206,
        headers: {
          ...CORS_HEADERS,
          'Accept-Ranges': 'bytes',
          'Content-Type': mimeType,
          'Content-Length': String(chunk.length),
          'Content-Range': `bytes ${range.start}-${range.end}/${fileStat.size}`,
          'Cache-Control': 'no-store',
        },
      });
    }

    return new Response(headOnly ? null : fullFile, {
      status: 200,
      headers: {
        ...CORS_HEADERS,
        'Accept-Ranges': 'bytes',
        'Content-Type': mimeType,
        'Content-Length': String(fileStat.size),
        'Cache-Control': 'no-store',
      },
    });
  } catch {
    return NextResponse.json({ error: 'Chat upload not found' }, { status: 404, headers: CORS_HEADERS });
  }
}

export async function GET(req: NextRequest, ctx: RouteContext) {
  return serveLocalChatUpload(req, ctx);
}

export async function HEAD(req: NextRequest, ctx: RouteContext) {
  return serveLocalChatUpload(req, ctx, true);
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}
