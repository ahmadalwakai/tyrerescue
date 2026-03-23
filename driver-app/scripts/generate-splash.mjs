import sharp from 'sharp';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const outDir = join(__dirname, '..', 'assets');

const BG = '#09090B';
const ORANGE = '#F97316';
const WHITE = '#FAFAFA';
const MUTED = '#71717A';

function spokes(cx, cy, innerR, outerR, sw, color) {
  let s = '';
  for (let i = 0; i < 5; i++) {
    const a = (i * 72 - 90) * Math.PI / 180;
    const x1 = cx + Math.cos(a) * innerR;
    const y1 = cy + Math.sin(a) * innerR;
    const x2 = cx + Math.cos(a) * outerR;
    const y2 = cy + Math.sin(a) * outerR;
    s += `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${color}" stroke-width="${sw}" stroke-linecap="round"/>`;
  }
  return s;
}

// --- Splash: 1284x2778 ---
const sw = 1284, sh = 2778;
const scx = sw / 2, scy = sh / 2 - 80;
const sr = 90;

const splashSvg = `<svg width="${sw}" height="${sh}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG}"/>
  <circle cx="${scx}" cy="${scy}" r="${sr}" stroke="${ORANGE}" stroke-width="14" fill="none"/>
  <circle cx="${scx}" cy="${scy}" r="50" stroke="${ORANGE}" stroke-width="5" fill="none"/>
  <circle cx="${scx}" cy="${scy}" r="14" fill="${ORANGE}"/>
  ${spokes(scx, scy, 14, 50, 5, ORANGE)}
  <text x="${scx}" y="${scy + sr + 80}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="64" letter-spacing="8" fill="${WHITE}">TYRE</text>
  <text x="${scx}" y="${scy + sr + 150}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="bold" font-size="64" letter-spacing="8" fill="${ORANGE}">RESCUE</text>
  <text x="${scx}" y="${scy + sr + 200}" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="normal" font-size="24" letter-spacing="12" fill="${MUTED}">DRIVER</text>
</svg>`;

// --- Icon: 1024x1024 ---
const icx = 512, icy = 512, ir = 180;
const iconSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="${BG}"/>
  <circle cx="${icx}" cy="${icy}" r="${ir}" stroke="${ORANGE}" stroke-width="28" fill="none"/>
  <circle cx="${icx}" cy="${icy}" r="100" stroke="${ORANGE}" stroke-width="10" fill="none"/>
  <circle cx="${icx}" cy="${icy}" r="28" fill="${ORANGE}"/>
  ${spokes(icx, icy, 28, 100, 10, ORANGE)}
</svg>`;

// --- Adaptive icon foreground (transparent bg) ---
const adaptiveSvg = `<svg width="1024" height="1024" xmlns="http://www.w3.org/2000/svg">
  <circle cx="${icx}" cy="${icy}" r="${ir}" stroke="${ORANGE}" stroke-width="28" fill="none"/>
  <circle cx="${icx}" cy="${icy}" r="100" stroke="${ORANGE}" stroke-width="10" fill="none"/>
  <circle cx="${icx}" cy="${icy}" r="28" fill="${ORANGE}"/>
  ${spokes(icx, icy, 28, 100, 10, ORANGE)}
</svg>`;

// --- Notification icon (white on transparent, 96x96) ---
const notifSvg = `<svg width="96" height="96" xmlns="http://www.w3.org/2000/svg">
  <circle cx="48" cy="48" r="36" stroke="white" stroke-width="8" fill="none"/>
  <circle cx="48" cy="48" r="20" stroke="white" stroke-width="3" fill="none"/>
  <circle cx="48" cy="48" r="6" fill="white"/>
</svg>`;

await sharp(Buffer.from(splashSvg)).png().toFile(join(outDir, 'splash.png'));
console.log('✓ splash.png');

await sharp(Buffer.from(iconSvg)).resize(1024, 1024).png().toFile(join(outDir, 'icon.png'));
console.log('✓ icon.png');

await sharp(Buffer.from(adaptiveSvg)).resize(1024, 1024).png().toFile(join(outDir, 'adaptive-icon.png'));
console.log('✓ adaptive-icon.png');

await sharp(Buffer.from(notifSvg)).resize(96, 96).png().toFile(join(outDir, 'notification-icon.png'));
console.log('✓ notification-icon.png');

console.log('Done.');
