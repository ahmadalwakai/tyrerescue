/**
 * Generate 4 branded homepage images for Tyre Rescue.
 *
 * Each image is a 1600×1200 JPG with:
 *   - Dark gradient background matching the brand (#09090B → #18181B)
 *   - Orange accent elements (#F97316)
 *   - Unique tyre / service themed SVG composition per slide
 *   - Professional, premium feel
 *
 * Run: node scripts/generate-home-images.mjs
 */

import sharp from 'sharp';
import { mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, '..', 'public', 'images', 'home');
mkdirSync(OUT, { recursive: true });

const W = 1600;
const H = 1200;
const ACCENT = '#F97316';
const ACCENT_DIM = 'rgba(249,115,22,0.15)';
const ACCENT_FAINT = 'rgba(249,115,22,0.06)';
const BG_DARK = '#09090B';
const BG_MID = '#18181B';
const BG_CARD = '#27272A';
const TEXT_PRIMARY = '#FAFAFA';
const TEXT_MUTED = '#A1A1AA';

// Shared noise pattern (subtle grain)
const noiseRect = `<filter id="noise"><feTurbulence type="fractalNoise" baseFrequency="0.65" numOctaves="3" stitchTiles="stitch"/></filter><rect width="100%" height="100%" filter="url(#noise)" opacity="0.025"/>`;

// ─── Image 1: Mobile Tyre Fitting Van ────────────────────
function heroMobileFitting() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg1" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="#0C0C0F"/>
      <stop offset="50%" stop-color="${BG_DARK}"/>
      <stop offset="100%" stop-color="#111114"/>
    </linearGradient>
    <radialGradient id="glow1" cx="65%" cy="55%" r="50%">
      <stop offset="0%" stop-color="rgba(249,115,22,0.12)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <linearGradient id="road" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a1a1e"/>
      <stop offset="100%" stop-color="#111114"/>
    </linearGradient>
    ${noiseRect}
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg1)"/>
  <rect width="${W}" height="${H}" fill="url(#glow1)"/>

  <!-- Road surface -->
  <rect x="0" y="680" width="${W}" height="520" fill="url(#road)"/>
  <line x1="0" y1="690" x2="${W}" y2="690" stroke="${BG_CARD}" stroke-width="2" opacity="0.4"/>

  <!-- Road dashes -->
  ${Array.from({length: 12}, (_, i) => `<rect x="${i * 140 + 20}" y="850" width="60" height="4" rx="2" fill="${TEXT_MUTED}" opacity="0.15"/>`).join('')}

  <!-- Van body -->
  <rect x="700" y="380" width="500" height="300" rx="12" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>
  <rect x="700" y="380" width="500" height="50" rx="12" fill="${ACCENT}" opacity="0.8"/>
  <rect x="700" y="410" width="500" height="20" fill="${BG_CARD}"/>

  <!-- Van windshield -->
  <rect x="1100" y="420" width="90" height="120" rx="6" fill="#1f2937" stroke="${BG_CARD}" stroke-width="2"/>
  <rect x="1108" y="428" width="74" height="104" rx="4" fill="rgba(249,115,22,0.04)"/>

  <!-- Van side panels -->
  <rect x="720" y="440" width="180" height="100" rx="4" fill="${BG_MID}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <rect x="920" y="440" width="160" height="100" rx="4" fill="${BG_MID}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>

  <!-- Van branding -->
  <text x="810" y="500" font-family="Arial, sans-serif" font-size="28" font-weight="bold" fill="${ACCENT}" text-anchor="middle" letter-spacing="3">TYRE RESCUE</text>
  <text x="810" y="525" font-family="Arial, sans-serif" font-size="12" fill="${TEXT_MUTED}" text-anchor="middle" letter-spacing="2">MOBILE FITTING</text>

  <!-- Wheels -->
  <circle cx="800" cy="690" r="50" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="4"/>
  <circle cx="800" cy="690" r="35" fill="${BG_DARK}" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  <circle cx="800" cy="690" r="14" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.6"/>
  ${[0,72,144,216,288].map(a => `<line x1="800" y1="690" x2="${800 + 32*Math.cos(a*Math.PI/180)}" y2="${690 + 32*Math.sin(a*Math.PI/180)}" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>`).join('')}

  <circle cx="1100" cy="690" r="50" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="4"/>
  <circle cx="1100" cy="690" r="35" fill="${BG_DARK}" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>
  <circle cx="1100" cy="690" r="14" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.6"/>
  ${[0,72,144,216,288].map(a => `<line x1="1100" y1="690" x2="${1100 + 32*Math.cos(a*Math.PI/180)}" y2="${690 + 32*Math.sin(a*Math.PI/180)}" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>`).join('')}

  <!-- Technician figure -->
  <circle cx="460" cy="520" r="28" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.7"/>
  <rect x="438" y="555" width="44" height="90" rx="8" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>
  <rect x="438" y="645" width="20" height="50" rx="4" fill="${BG_CARD}"/>
  <rect x="462" y="645" width="20" height="50" rx="4" fill="${BG_CARD}"/>

  <!-- Tyre being held -->
  <circle cx="380" cy="590" r="42" fill="none" stroke="${BG_CARD}" stroke-width="16"/>
  <circle cx="380" cy="590" r="42" fill="none" stroke="rgba(255,255,255,0.06)" stroke-width="14"/>
  <circle cx="380" cy="590" r="20" fill="${BG_DARK}" stroke="rgba(255,255,255,0.08)" stroke-width="1"/>
  ${[0,60,120,180,240,300].map(a => `<line x1="${380 + 28*Math.cos(a*Math.PI/180)}" y1="${590 + 28*Math.sin(a*Math.PI/180)}" x2="${380 + 40*Math.cos(a*Math.PI/180)}" y2="${590 + 40*Math.sin(a*Math.PI/180)}" stroke="${BG_DARK}" stroke-width="3" stroke-linecap="round"/>`).join('')}

  <!-- House silhouette (driveway context) -->
  <polygon points="80,680 80,480 200,380 320,480 320,680" fill="${BG_MID}" opacity="0.5"/>
  <rect x="140" y="560" width="60" height="80" rx="2" fill="rgba(249,115,22,0.05)" stroke="${BG_CARD}" stroke-width="1"/>
  <polygon points="80,480 200,380 320,480" fill="#1f1f23" opacity="0.5"/>

  <!-- Ambient light from van -->
  <ellipse cx="950" cy="700" rx="300" ry="80" fill="rgba(249,115,22,0.04)"/>

  <!-- Subtle grid pattern in sky -->
  ${Array.from({length: 8}, (_, i) => `<line x1="${i * 220}" y1="0" x2="${i * 220}" y2="680" stroke="rgba(255,255,255,0.012)" stroke-width="1"/>`).join('')}
  ${Array.from({length: 5}, (_, i) => `<line x1="0" y1="${i * 170}" x2="${W}" y2="${i * 170}" stroke="rgba(255,255,255,0.012)" stroke-width="1"/>`).join('')}
</svg>`;
}

// ─── Image 2: Roadside Assistance ────────────────────────
function roadsideAssistance() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg2" x1="0" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#0a0a0d"/>
      <stop offset="100%" stop-color="#111116"/>
    </linearGradient>
    <radialGradient id="glow2" cx="40%" cy="50%" r="55%">
      <stop offset="0%" stop-color="rgba(249,115,22,0.10)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="hazard" cx="50%" cy="50%" r="50%">
      <stop offset="0%" stop-color="${ACCENT}"/>
      <stop offset="60%" stop-color="rgba(249,115,22,0.3)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg2)"/>
  <rect width="${W}" height="${H}" fill="url(#glow2)"/>

  <!-- Motorway surface -->
  <rect x="0" y="650" width="${W}" height="550" fill="#141417"/>
  <line x1="0" y1="660" x2="${W}" y2="660" stroke="${BG_CARD}" stroke-width="3" opacity="0.3"/>

  <!-- Lane markings -->
  ${Array.from({length: 14}, (_, i) => `<rect x="${i * 130 + 10}" y="820" width="55" height="4" rx="2" fill="white" opacity="0.08"/>`).join('')}
  <line x1="0" y1="750" x2="${W}" y2="750" stroke="white" stroke-width="2" opacity="0.04"/>

  <!-- Stranded car -->
  <rect x="400" y="540" width="350" height="150" rx="16" fill="${BG_CARD}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>
  <rect x="420" y="520" width="120" height="60" rx="10" fill="#1f2937" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <rect x="600" y="520" width="100" height="60" rx="10" fill="#1f2937" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>

  <!-- Car wheels -->
  <circle cx="470" cy="698" r="40" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="470" cy="698" r="28" fill="${BG_DARK}" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>
  <circle cx="680" cy="698" r="40" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="680" cy="698" r="28" fill="${BG_DARK}" stroke="rgba(255,255,255,0.06)" stroke-width="1.5"/>

  <!-- Flat tyre indicator on front -->
  <ellipse cx="470" cy="710" rx="44" ry="32" fill="none" stroke="rgba(239,68,68,0.3)" stroke-width="1.5" stroke-dasharray="4 4"/>

  <!-- Hazard warning glow -->
  <circle cx="760" cy="560" r="6" fill="${ACCENT}" opacity="0.9"/>
  <circle cx="760" cy="560" r="20" fill="url(#hazard)" opacity="0.5"/>
  <circle cx="400" cy="560" r="6" fill="${ACCENT}" opacity="0.9"/>
  <circle cx="400" cy="560" r="20" fill="url(#hazard)" opacity="0.5"/>

  <!-- Rescue van arriving (right side) -->
  <rect x="1050" y="480" width="380" height="220" rx="10" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.8"/>
  <rect x="1050" y="480" width="380" height="40" rx="10" fill="${ACCENT}" opacity="0.6"/>
  <rect x="1050" y="505" width="380" height="15" fill="${BG_CARD}"/>
  <text x="1240" y="570" font-family="Arial, sans-serif" font-size="22" font-weight="bold" fill="${ACCENT}" text-anchor="middle" letter-spacing="2">TYRE RESCUE</text>
  <text x="1240" y="592" font-family="Arial, sans-serif" font-size="11" fill="${TEXT_MUTED}" text-anchor="middle" letter-spacing="2">EMERGENCY</text>

  <!-- Rescue van wheels -->
  <circle cx="1130" cy="710" r="38" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="1130" cy="710" r="26" fill="${BG_DARK}"/>
  <circle cx="1350" cy="710" r="38" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="1350" cy="710" r="26" fill="${BG_DARK}"/>

  <!-- Emergency light bar -->
  <rect x="1140" y="468" width="200" height="14" rx="7" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1"/>
  <circle cx="1200" cy="475" r="4" fill="${ACCENT}" opacity="0.9"/>
  <circle cx="1240" cy="475" r="4" fill="rgba(59,130,246,0.8)"/>
  <circle cx="1280" cy="475" r="4" fill="${ACCENT}" opacity="0.9"/>

  <!-- Technician walking toward car -->
  <circle cx="860" cy="560" r="22" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.2" opacity="0.7"/>
  <rect x="842" y="588" width="36" height="72" rx="6" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>
  <rect x="842" y="660" width="16" height="40" rx="3" fill="${BG_CARD}"/>
  <rect x="862" y="660" width="16" height="40" rx="3" fill="${BG_CARD}"/>

  <!-- Toolbox -->
  <rect x="900" y="620" width="40" height="28" rx="4" fill="${BG_MID}" stroke="${ACCENT}" stroke-width="1" opacity="0.6"/>
  <line x1="910" y1="617" x2="930" y2="617" stroke="${ACCENT}" stroke-width="2" opacity="0.4"/>

  <!-- Headlight beams from rescue van -->
  <polygon points="1050,580 900,640 900,680 1050,620" fill="rgba(249,115,22,0.03)"/>

  <!-- Road barrier/reflectors -->
  ${Array.from({length: 6}, (_, i) => `<rect x="${160 + i * 30}" y="770" width="4" height="20" rx="2" fill="${ACCENT}" opacity="0.3"/>`).join('')}

  <!-- Sky grid -->
  ${Array.from({length: 7}, (_, i) => `<line x1="${i * 250}" y1="0" x2="${i * 250}" y2="650" stroke="rgba(255,255,255,0.01)" stroke-width="1"/>`).join('')}
</svg>`;
}

// ─── Image 3: Driveway Service ───────────────────────────
function drivewayService() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <linearGradient id="bg3" x1="0.2" y1="0" x2="0.8" y2="1">
      <stop offset="0%" stop-color="#0d0d10"/>
      <stop offset="100%" stop-color="${BG_DARK}"/>
    </linearGradient>
    <radialGradient id="glow3" cx="55%" cy="45%" r="50%">
      <stop offset="0%" stop-color="rgba(249,115,22,0.08)"/>
      <stop offset="100%" stop-color="transparent"/>
    </radialGradient>
    <linearGradient id="grass" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="#1a2018"/>
      <stop offset="100%" stop-color="#141714"/>
    </linearGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg3)"/>
  <rect width="${W}" height="${H}" fill="url(#glow3)"/>

  <!-- Sky area with subtle clouds -->
  <ellipse cx="400" cy="200" rx="300" ry="60" fill="rgba(255,255,255,0.015)"/>
  <ellipse cx="1100" cy="150" rx="250" ry="50" fill="rgba(255,255,255,0.01)"/>

  <!-- House -->
  <rect x="100" y="320" width="500" height="380" fill="${BG_MID}" stroke="rgba(255,255,255,0.04)" stroke-width="1"/>
  <polygon points="100,320 350,180 600,320" fill="#1c1c20"/>
  <!-- Windows -->
  <rect x="160" y="380" width="80" height="90" rx="3" fill="rgba(249,115,22,0.06)" stroke="${BG_CARD}" stroke-width="1.5"/>
  <rect x="280" y="380" width="80" height="90" rx="3" fill="rgba(249,115,22,0.06)" stroke="${BG_CARD}" stroke-width="1.5"/>
  <rect x="420" y="380" width="80" height="90" rx="3" fill="rgba(249,115,22,0.04)" stroke="${BG_CARD}" stroke-width="1.5"/>
  <!-- Door -->
  <rect x="260" y="530" width="90" height="170" rx="4" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>
  <circle cx="338" cy="620" r="4" fill="${ACCENT}" opacity="0.5"/>
  <!-- Porch light -->
  <circle cx="250" cy="510" r="8" fill="${ACCENT}" opacity="0.4"/>
  <circle cx="250" cy="510" r="30" fill="rgba(249,115,22,0.06)"/>

  <!-- Driveway surface -->
  <rect x="580" y="700" width="${W - 580}" height="500" fill="#161619"/>
  <polygon points="260,700 580,700 ${W},700 ${W},1200 0,1200 0,700" fill="#131316"/>
  <line x1="0" y1="705" x2="${W}" y2="705" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>

  <!-- Garden strips -->
  <rect x="0" y="700" width="260" height="500" fill="url(#grass)" opacity="0.6"/>
  <rect x="560" y="700" width="30" height="300" fill="url(#grass)" opacity="0.4"/>

  <!-- Customer car -->
  <rect x="680" y="530" width="320" height="180" rx="14" fill="${BG_CARD}" stroke="rgba(255,255,255,0.05)" stroke-width="1"/>
  <rect x="700" y="510" width="100" height="60" rx="10" fill="#1f2937" opacity="0.8"/>
  <rect x="860" y="510" width="90" height="60" rx="10" fill="#1f2937" opacity="0.8"/>

  <!-- Car wheels -->
  <circle cx="740" cy="718" r="36" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="740" cy="718" r="24" fill="${BG_DARK}"/>
  <circle cx="940" cy="718" r="36" fill="#1a1a1e" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="940" cy="718" r="24" fill="${BG_DARK}"/>

  <!-- Jack under car -->
  <polygon points="820,710 860,710 850,740 830,740" fill="${ACCENT}" opacity="0.4"/>
  <rect x="830" y="700" width="20" height="12" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>

  <!-- Technician kneeling -->
  <circle cx="1100" cy="580" r="24" fill="${BG_CARD}" stroke="${ACCENT}" stroke-width="1.2" opacity="0.7"/>
  <rect x="1080" y="610" width="40" height="60" rx="6" fill="${BG_CARD}" stroke="${ACCENT_DIM}" stroke-width="1"/>
  <rect x="1080" y="670" width="44" height="30" rx="4" fill="${BG_CARD}"/>

  <!-- Spare tyre leaning against car -->
  <ellipse cx="1060" cy="690" rx="38" ry="42" fill="none" stroke="${BG_CARD}" stroke-width="14"/>
  <ellipse cx="1060" cy="690" rx="38" ry="42" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="12"/>
  <ellipse cx="1060" cy="690" rx="18" ry="20" fill="${BG_DARK}" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>

  <!-- Tool tray -->
  <rect x="1140" y="680" width="80" height="20" rx="3" fill="${BG_MID}" stroke="${ACCENT}" stroke-width="1" opacity="0.5"/>
  <circle cx="1160" cy="678" r="4" fill="${ACCENT}" opacity="0.3"/>
  <circle cx="1180" cy="678" r="3" fill="${TEXT_MUTED}" opacity="0.2"/>
  <rect x="1195" y="675" width="15" height="5" rx="2" fill="${TEXT_MUTED}" opacity="0.2"/>

  <!-- Ambient light -->
  <ellipse cx="840" cy="720" rx="250" ry="60" fill="rgba(249,115,22,0.03)"/>
</svg>`;
}

// ─── Image 4: Premium Tyre Close-up ─────────────────────
function premiumTyreCloseup() {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}">
  <defs>
    <radialGradient id="bg4" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stop-color="#111114"/>
      <stop offset="100%" stop-color="${BG_DARK}"/>
    </radialGradient>
    <radialGradient id="glow4" cx="50%" cy="50%" r="45%">
      <stop offset="0%" stop-color="rgba(249,115,22,0.1)"/>
      <stop offset="80%" stop-color="transparent"/>
    </radialGradient>
    <radialGradient id="alloy" cx="48%" cy="48%" r="50%">
      <stop offset="0%" stop-color="#3a3a40"/>
      <stop offset="100%" stop-color="#1a1a1e"/>
    </radialGradient>
    <radialGradient id="hubcap" cx="45%" cy="45%" r="50%">
      <stop offset="0%" stop-color="${BG_CARD}"/>
      <stop offset="100%" stop-color="#1a1a1e"/>
    </radialGradient>
  </defs>
  <rect width="${W}" height="${H}" fill="url(#bg4)"/>
  <rect width="${W}" height="${H}" fill="url(#glow4)"/>

  <!-- Main tyre (large centered) -->
  <!-- Outer rubber -->
  <circle cx="780" cy="600" r="440" fill="#111114" stroke="${BG_CARD}" stroke-width="3"/>
  <circle cx="780" cy="600" r="440" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="80"/>

  <!-- Tread pattern - concentric rings -->
  <circle cx="780" cy="600" r="420" fill="none" stroke="rgba(255,255,255,0.04)" stroke-width="2"/>
  <circle cx="780" cy="600" r="400" fill="none" stroke="rgba(255,255,255,0.03)" stroke-width="1"/>
  <circle cx="780" cy="600" r="380" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="2"/>

  <!-- Tread blocks (radial pattern) -->
  ${Array.from({length: 36}, (_, i) => {
    const a = i * 10 * Math.PI / 180;
    const x1 = 780 + 380 * Math.cos(a);
    const y1 = 600 + 380 * Math.sin(a);
    const x2 = 780 + 430 * Math.cos(a);
    const y2 = 600 + 430 * Math.sin(a);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="rgba(255,255,255,0.04)" stroke-width="${i % 3 === 0 ? 6 : 3}" stroke-linecap="round"/>`;
  }).join('')}

  <!-- Sidewall text arc (simulated) -->
  ${Array.from({length: 20}, (_, i) => {
    const a = (i * 4 + 160) * Math.PI / 180;
    const x = 780 + 360 * Math.cos(a);
    const y = 600 + 360 * Math.sin(a);
    return `<rect x="${x-4}" y="${y-2}" width="8" height="4" rx="1" fill="rgba(255,255,255,0.06)" transform="rotate(${i * 4 + 160} ${x} ${y})"/>`;
  }).join('')}

  <!-- Alloy wheel -->
  <circle cx="780" cy="600" r="280" fill="url(#alloy)" stroke="rgba(255,255,255,0.08)" stroke-width="2"/>

  <!-- Alloy spokes (5-spoke design) -->
  ${Array.from({length: 5}, (_, i) => {
    const a = (i * 72 - 18) * Math.PI / 180;
    const a2 = ((i * 72) + 18) * Math.PI / 180;
    const ox = 780, oy = 600;
    const ix1 = ox + 80 * Math.cos(a), iy1 = oy + 80 * Math.sin(a);
    const ix2 = ox + 80 * Math.cos(a2), iy2 = oy + 80 * Math.sin(a2);
    const ox1 = ox + 260 * Math.cos(a - 0.05), oy1 = oy + 260 * Math.sin(a - 0.05);
    const ox2 = ox + 260 * Math.cos(a2 + 0.05), oy2 = oy + 260 * Math.sin(a2 + 0.05);
    return `<polygon points="${ix1},${iy1} ${ox1},${oy1} ${ox2},${oy2} ${ix2},${iy2}" fill="#222228" stroke="rgba(255,255,255,0.06)" stroke-width="1"/>`;
  }).join('')}

  <!-- Hub cap -->
  <circle cx="780" cy="600" r="70" fill="url(#hubcap)" stroke="rgba(255,255,255,0.1)" stroke-width="2"/>
  <circle cx="780" cy="600" r="30" fill="${BG_DARK}" stroke="${ACCENT}" stroke-width="1.5" opacity="0.5"/>

  <!-- Lug nuts -->
  ${Array.from({length: 5}, (_, i) => {
    const a = (i * 72) * Math.PI / 180;
    const x = 780 + 50 * Math.cos(a);
    const y = 600 + 50 * Math.sin(a);
    return `<circle cx="${x}" cy="${y}" r="8" fill="${BG_MID}" stroke="rgba(255,255,255,0.12)" stroke-width="1.5"/>`;
  }).join('')}

  <!-- Orange rim highlight -->
  <circle cx="780" cy="600" r="282" fill="none" stroke="${ACCENT}" stroke-width="1" opacity="0.2"/>
  <circle cx="780" cy="600" r="278" fill="none" stroke="${ACCENT}" stroke-width="0.5" opacity="0.15"/>

  <!-- Tread highlight on visible edge -->
  ${Array.from({length: 12}, (_, i) => {
    const a = (i * 30 + 15) * Math.PI / 180;
    const x1 = 780 + 390 * Math.cos(a);
    const y1 = 600 + 390 * Math.sin(a);
    const x2 = 780 + 425 * Math.cos(a);
    const y2 = 600 + 425 * Math.sin(a);
    return `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${ACCENT}" stroke-width="2" stroke-linecap="round" opacity="0.08"/>`;
  }).join('')}

  <!-- Subtle reflective sheen -->
  <ellipse cx="680" cy="460" rx="200" ry="300" fill="rgba(255,255,255,0.015)" transform="rotate(-20 680 460)"/>

  <!-- Floor reflection -->
  <ellipse cx="780" cy="1050" rx="400" ry="80" fill="rgba(249,115,22,0.03)"/>

  <!-- Corner accent dots -->
  <circle cx="100" cy="100" r="3" fill="${ACCENT}" opacity="0.3"/>
  <circle cx="${W - 100}" cy="100" r="3" fill="${ACCENT}" opacity="0.3"/>
  <circle cx="100" cy="${H - 100}" r="3" fill="${ACCENT}" opacity="0.3"/>
  <circle cx="${W - 100}" cy="${H - 100}" r="3" fill="${ACCENT}" opacity="0.3"/>
</svg>`;
}

// ─── Generate all 4 images ──────────────────────────────
const images = [
  { name: 'hero-mobile-tyre-fitting.jpg', svg: heroMobileFitting() },
  { name: 'roadside-tyre-assistance.jpg', svg: roadsideAssistance() },
  { name: 'driveway-tyre-service.jpg', svg: drivewayService() },
  { name: 'premium-tyre-closeup.jpg', svg: premiumTyreCloseup() },
];

for (const { name, svg } of images) {
  const out = join(OUT, name);
  await sharp(Buffer.from(svg))
    .resize(W, H)
    .jpeg({ quality: 85, mozjpeg: true })
    .toFile(out);
  const stats = (await import('fs')).statSync(out);
  console.log(`✓ ${name} — ${(stats.size / 1024).toFixed(0)} KB`);
}

console.log('\nDone! All images saved to public/images/home/');
