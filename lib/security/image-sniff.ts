export type SniffedImageType = 'image/jpeg' | 'image/png' | 'image/webp';

/**
 * Detect the image type from a file's first bytes (at least 12). The
 * declared `File.type` comes from the client and cannot be trusted alone.
 */
export function sniffImageType(head: Uint8Array): SniffedImageType | null {
  if (head[0] === 0xff && head[1] === 0xd8 && head[2] === 0xff) return 'image/jpeg';
  if (head[0] === 0x89 && head[1] === 0x50 && head[2] === 0x4e && head[3] === 0x47
    && head[4] === 0x0d && head[5] === 0x0a && head[6] === 0x1a && head[7] === 0x0a) return 'image/png';
  const ascii = (from: number, to: number) => String.fromCharCode(...head.slice(from, to));
  if (ascii(0, 4) === 'RIFF' && ascii(8, 12) === 'WEBP') return 'image/webp';
  return null;
}
