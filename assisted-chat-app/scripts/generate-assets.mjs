// Generates Expo Android assets for assisted-chat-app from the existing
// Tyre Rescue logo SVG. Runs locally via Node; uses `sharp` already present
// in the repo root node_modules. No external services, no paid tools.
//
// Output:
//   assisted-chat-app/assets/icon.png            (1024x1024, dark bg + logo)
//   assisted-chat-app/assets/adaptive-icon.png   (1024x1024, foreground only,
//                                                 logo centered inside safe
//                                                 zone for adaptive mask)
//   assisted-chat-app/assets/splash.png          (1242x2436, dark bg + logo)
//   assisted-chat-app/assets/favicon.png         (64x64)

import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const sharp = require(resolve(
  fileURLToPath(import.meta.url),
  '..',
  '..',
  '..',
  'node_modules',
  'sharp',
));

const here = dirname(fileURLToPath(import.meta.url));
const ASSETS = resolve(here, '..', 'assets');
await mkdir(ASSETS, { recursive: true });

const BG = '#09090B';
const ORANGE = '#F97316';
const WHITE = '#FFFFFF';

// SVG for the wheel mark, scaled inside a viewBox of 1024x1024.
function wheelSvg(size, opts = {}) {
  const { withWordmark = false, padding = 0.18 } = opts;
  // Place wheel slightly above center when wordmark is shown.
  const cx = size / 2;
  const cy = withWordmark ? size * 0.40 : size / 2;
  const radius = (size * (1 - padding * 2)) / 2;
  const rOuter = radius;
  const rRim = radius * 0.54;
  const rHub = radius * 0.15;
  const strokeOuter = radius * 0.30;
  const strokeRim = radius * 0.12;
  const strokeSpoke = radius * 0.10;
  // Spoke endpoints around the rim
  const spokes = [];
  const spokeLen = rRim * 0.95;
  // Match original 5-spoke pattern by reducing list:
  const spokeAngles = [-90, -18, 54, 126, 198];
  for (const aDeg of spokeAngles) {
    const a = (aDeg * Math.PI) / 180;
    const x2 = cx + spokeLen * Math.cos(a);
    const y2 = cy + spokeLen * Math.sin(a);
    spokes.push(
      `<line x1="${cx}" y1="${cy}" x2="${x2.toFixed(
        2,
      )}" y2="${y2.toFixed(
        2,
      )}" stroke="${ORANGE}" stroke-width="${strokeSpoke.toFixed(
        2,
      )}" stroke-linecap="round"/>`,
    );
  }

  const wordmark = withWordmark
    ? `
    <g font-family="Inter, Helvetica, Arial, sans-serif" text-anchor="middle" font-weight="800" letter-spacing="${(
      size * 0.012
    ).toFixed(2)}">
      <text x="${cx}" y="${size * 0.78}" font-size="${(size * 0.115).toFixed(
        2,
      )}" fill="${ORANGE}">TYRE</text>
      <text x="${cx}" y="${size * 0.88}" font-size="${(size * 0.115).toFixed(
        2,
      )}" fill="${WHITE}">RESCUE</text>
    </g>`
    : '';

  return Buffer.from(
    `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <circle cx="${cx}" cy="${cy}" r="${rOuter.toFixed(
    2,
  )}" stroke="${ORANGE}" stroke-width="${strokeOuter.toFixed(2)}" fill="none"/>
  <circle cx="${cx}" cy="${cy}" r="${rRim.toFixed(
    2,
  )}" stroke="${ORANGE}" stroke-width="${strokeRim.toFixed(2)}" fill="none"/>
  <circle cx="${cx}" cy="${cy}" r="${rHub.toFixed(2)}" fill="${ORANGE}"/>
  ${spokes.join('\n  ')}
  ${wordmark}
</svg>`,
    'utf8',
  );
}

async function build() {
  // 1. Standard Android icon (1024 with dark background, logo + wordmark).
  const iconSvg = wheelSvg(1024, { withWordmark: true, padding: 0.22 });
  // Render SVG directly so it includes its own background-free composition,
  // then flatten onto BG using sharp.create.
  const iconPng = await sharp(iconSvg)
    .flatten({ background: BG })
    .png()
    .toBuffer();
  await writeFile(resolve(ASSETS, 'icon.png'), iconPng);

  // 2. Adaptive icon foreground. Android masks ~33% off each edge, so the
  // foreground content must sit inside the central ~66% safe zone. We add
  // extra padding to keep the wheel mark fully visible after masking.
  // Foreground is transparent outside the mark; background is provided via
  // app.json android.adaptiveIcon.backgroundColor.
  const adaptiveSvg = wheelSvg(1024, {
    withWordmark: false,
    padding: 0.32, // pushes mark into central safe zone
  });
  const adaptivePng = await sharp(adaptiveSvg).png().toBuffer();
  await writeFile(resolve(ASSETS, 'adaptive-icon.png'), adaptivePng);

  // 3. Splash — matches dark login screen. Centered wheel + wordmark.
  const splashW = 1242;
  const splashH = 2436;
  const splashLogoSize = 720;
  const splashLogoSvg = wheelSvg(splashLogoSize, {
    withWordmark: true,
    padding: 0.10,
  });
  const splashPng = await sharp({
    create: {
      width: splashW,
      height: splashH,
      channels: 4,
      background: BG,
    },
  })
    .composite([
      {
        input: splashLogoSvg,
        top: Math.round((splashH - splashLogoSize) / 2),
        left: Math.round((splashW - splashLogoSize) / 2),
        blend: 'over',
      },
    ])
    .png()
    .toBuffer();
  await writeFile(resolve(ASSETS, 'splash.png'), splashPng);

  // 4. Favicon for web preview.
  const faviconSvg = wheelSvg(256, { withWordmark: false, padding: 0.18 });
  const faviconPng = await sharp(faviconSvg)
    .flatten({ background: BG })
    .resize(64, 64)
    .png()
    .toBuffer();
  await writeFile(resolve(ASSETS, 'favicon.png'), faviconPng);

  console.log('Wrote:', [
    'assets/icon.png',
    'assets/adaptive-icon.png',
    'assets/splash.png',
    'assets/favicon.png',
  ]);
}

build().catch((err) => {
  console.error(err);
  process.exit(1);
});
