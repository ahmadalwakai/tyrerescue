import { mkdir, readdir, readFile } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

type ImageMetadata = {
  format?: string;
  width?: number;
  height?: number;
};

type SharpImage = {
  metadata(): Promise<ImageMetadata>;
  resize(options: Record<string, unknown>): SharpImage;
  png(options?: Record<string, unknown>): SharpImage;
  composite(images: Array<Record<string, unknown>>): SharpImage;
  toBuffer(): Promise<Buffer>;
  toFile(filePath: string): Promise<unknown>;
};

type SharpFactory = {
  (input?: unknown, options?: unknown): SharpImage;
};

type Slide = {
  headline: string;
  subtext: string;
  output: string;
};

const OUTPUT_WIDTH = 1290;
const OUTPUT_HEIGHT = 2796;

const DEVICE = {
  x: 188,
  y: 704,
  width: 914,
  height: 1934,
  screenX: 46,
  screenY: 90,
  screenWidth: 822,
  screenHeight: 1754,
  screenRadius: 58,
};

const slides: Slide[] = [
  {
    headline: "Accept urgent jobs fast",
    subtext: "New tyre rescue jobs are shown clearly so drivers can act quickly.",
    output: "01-accept-urgent-jobs.png",
  },
  {
    headline: "Navigate with job details",
    subtext: "See the customer location, tyre details, and route information in one place.",
    output: "02-navigate-job-details.png",
  },
  {
    headline: "Know every job status",
    subtext: "Track active, completed, and payment status without confusion.",
    output: "03-job-status.png",
  },
  {
    headline: "Built for mobile drivers",
    subtext: "Simple controls for busy roadside work.",
    output: "04-mobile-drivers.png",
  },
  {
    headline: "Driver operations made clear",
    subtext: "Focused screens for dispatch, progress, and completion.",
    output: "05-driver-operations.png",
  },
];

const knownIosPhonePortraitSizes = new Set([
  "750x1334",
  "828x1792",
  "1080x2340",
  "1125x2436",
  "1170x2532",
  "1179x2556",
  "1206x2622",
  "1242x2208",
  "1242x2688",
  "1260x2736",
  "1284x2778",
  "1290x2796",
  "1320x2868",
]);

const blockedInputNamePatterns = [
  /android/i,
  /admin/i,
  /browser/i,
  /chrome/i,
  /customer/i,
  /google[-_ ]?play/i,
  /play[-_ ]?store/i,
  /safari/i,
  /website/i,
  /web[-_ ]?source/i,
];

const blockedInputHashes = new Map<string, string>([
  [
    "1723450888d7bc674291946cd77fd7d5e0237e08c9c073243410f781cd049b22",
    "known Expo web/browser source: 06-dashboard-clean.png",
  ],
  [
    "04e87585d682f20366877246862b5d73a2611dcf2fb7048bd81649dcbfb8ca03",
    "known Expo web/browser source: 08-job-detail-clean.png",
  ],
  [
    "585c551c52fd3d7f5a6c5e3df956c12ea07e0d7a7d2de48025800e2b6082f485",
    "known Expo web/browser source: 13-jobs-no-web-header.png",
  ],
  [
    "bd1f34298e0c62de77e2df71b8d3b125de8282e211bcf81350c421744bfd6f23",
    "known Expo web/browser source: 09-notifications-clean.png",
  ],
  [
    "810f41ce8ec13e1df66d67be4663a8d746ad486b982e6cf6a44d121fbbd49bbe",
    "known Expo web/browser source: 14-chat-no-web-header.png",
  ],
]);

async function loadSharp(): Promise<SharpFactory> {
  try {
    const sharpModule = (await import("sharp")) as SharpFactory | { default: SharpFactory };
    return "default" in sharpModule ? sharpModule.default : sharpModule;
  } catch (error) {
    throw new Error(
      "The screenshot generator requires the `sharp` package, but it is not installed. Do not add it silently; get approval before adding the dependency, then rerun `npm run appstore:screenshots`.",
      { cause: error },
    );
  }
}

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function wrapText(text: string, maxCharacters: number): string[] {
  const lines: string[] = [];
  let current = "";

  for (const word of text.split(/\s+/)) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxCharacters && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  }

  if (current) {
    lines.push(current);
  }

  return lines;
}

function backgroundSvg(): Buffer {
  return Buffer.from(`
    <svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#17191B"/>
          <stop offset="52%" stop-color="#101214"/>
          <stop offset="100%" stop-color="#090A0B"/>
        </linearGradient>
      </defs>
      <rect width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" fill="url(#bg)"/>
      <rect x="0" y="0" width="${OUTPUT_WIDTH}" height="10" fill="#F97316" opacity="0.95"/>
      <path d="M-80 462 C 284 318, 610 382, 986 220 S 1396 98, 1488 172" fill="none" stroke="#F97316" stroke-width="3" stroke-opacity="0.18"/>
      <path d="M-120 2488 C 248 2304, 622 2368, 1008 2188 S 1430 2060, 1510 2140" fill="none" stroke="#F97316" stroke-width="3" stroke-opacity="0.14"/>
      <path d="M92 640 L1198 420" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.06"/>
      <path d="M88 2684 L1210 2484" fill="none" stroke="#FFFFFF" stroke-width="1" stroke-opacity="0.055"/>
    </svg>
  `);
}

function textBlockSvg(slide: Slide, index: number): Buffer {
  const headlineLines = wrapText(slide.headline, 24);
  const subtextLines = wrapText(slide.subtext, 45);
  const headlineY = 226;
  const headlineLineHeight = 90;
  const subtextY = headlineY + headlineLines.length * headlineLineHeight + 36;

  const headlineTspans = headlineLines
    .map((line, lineIndex) => {
      const dy = lineIndex === 0 ? 0 : headlineLineHeight;
      return `<tspan x="645" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  const subtextTspans = subtextLines
    .map((line, lineIndex) => {
      const dy = lineIndex === 0 ? 0 : 50;
      return `<tspan x="645" dy="${dy}">${escapeXml(line)}</tspan>`;
    })
    .join("");

  return Buffer.from(`
    <svg width="${OUTPUT_WIDTH}" height="${OUTPUT_HEIGHT}" viewBox="0 0 ${OUTPUT_WIDTH} ${OUTPUT_HEIGHT}" xmlns="http://www.w3.org/2000/svg">
      <text x="645" y="124" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="800" letter-spacing="3" fill="#F97316">TYRE RESCUE DRIVER</text>
      <rect x="505" y="154" width="280" height="6" rx="3" fill="#F97316"/>
      <text x="645" y="${headlineY}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="78" font-weight="900" fill="#FFFFFF">${headlineTspans}</text>
      <text x="645" y="${subtextY}" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="38" font-weight="500" fill="#D9DEDD">${subtextTspans}</text>
      <text x="645" y="2680" text-anchor="middle" font-family="Inter, Arial, sans-serif" font-size="28" font-weight="700" fill="#F97316">0${index + 1} / 05</text>
    </svg>
  `);
}

function deviceBaseSvg(): Buffer {
  return Buffer.from(`
    <svg width="${DEVICE.width}" height="${DEVICE.height}" viewBox="0 0 ${DEVICE.width} ${DEVICE.height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="34" width="16" height="260" rx="8" fill="#202427"/>
      <rect x="${DEVICE.width - 16}" y="260" width="16" height="210" rx="8" fill="#202427"/>
      <rect x="8" y="0" width="${DEVICE.width - 16}" height="${DEVICE.height}" rx="96" fill="#050607" stroke="#2B3033" stroke-width="7"/>
      <rect x="${DEVICE.screenX}" y="${DEVICE.screenY}" width="${DEVICE.screenWidth}" height="${DEVICE.screenHeight}" rx="${DEVICE.screenRadius}" fill="#080A0B"/>
      <rect x="${DEVICE.screenX + 4}" y="${DEVICE.screenY + 4}" width="${DEVICE.screenWidth - 8}" height="${DEVICE.screenHeight - 8}" rx="${DEVICE.screenRadius - 4}" fill="none" stroke="#202427" stroke-width="2"/>
    </svg>
  `);
}

function deviceOverlaySvg(): Buffer {
  return Buffer.from(`
    <svg width="${DEVICE.width}" height="${DEVICE.height}" viewBox="0 0 ${DEVICE.width} ${DEVICE.height}" xmlns="http://www.w3.org/2000/svg">
      <rect x="${DEVICE.screenX}" y="${DEVICE.screenY}" width="${DEVICE.screenWidth}" height="${DEVICE.screenHeight}" rx="${DEVICE.screenRadius}" fill="none" stroke="#111416" stroke-width="8"/>
      <rect x="${DEVICE.width / 2 - 132}" y="34" width="264" height="42" rx="21" fill="#050607"/>
      <circle cx="${DEVICE.width / 2 + 96}" cy="55" r="10" fill="#14191C"/>
      <rect x="${DEVICE.width / 2 - 62}" y="50" width="124" height="10" rx="5" fill="#171C1F"/>
      <rect x="13" y="5" width="${DEVICE.width - 26}" height="${DEVICE.height - 10}" rx="91" fill="none" stroke="#F97316" stroke-width="2" stroke-opacity="0.34"/>
    </svg>
  `);
}

function roundedMaskSvg(): Buffer {
  return Buffer.from(`
    <svg width="${DEVICE.screenWidth}" height="${DEVICE.screenHeight}" viewBox="0 0 ${DEVICE.screenWidth} ${DEVICE.screenHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect width="${DEVICE.screenWidth}" height="${DEVICE.screenHeight}" rx="${DEVICE.screenRadius}" fill="#FFFFFF"/>
    </svg>
  `);
}

async function sha256(filePath: string): Promise<string> {
  return createHash("sha256").update(await readFile(filePath)).digest("hex");
}

async function listInputPngs(inputDir: string): Promise<string[]> {
  const entries = await readdir(inputDir, { withFileTypes: true });
  const pngs = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".png"))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  if (pngs.length !== slides.length) {
    throw new Error(
      `Expected exactly ${slides.length} input PNG screenshots in ${inputDir}, but found ${pngs.length}. Put one real iOS Driver App screenshot for each output image and rerun the generator.`,
    );
  }

  return pngs.map((name) => path.join(inputDir, name));
}

async function validateInputScreenshot(sharp: SharpFactory, filePath: string): Promise<void> {
  const fileName = path.basename(filePath);
  const blockedPattern = blockedInputNamePatterns.find((pattern) => pattern.test(fileName));

  if (blockedPattern) {
    throw new Error(
      `Input file "${fileName}" is unsafe for this Driver iOS workflow because it matches ${blockedPattern}. Use only real iOS Driver App screenshots, not Android, browser, customer, admin, website, or Google Play assets.`,
    );
  }

  const inputHash = await sha256(filePath);
  const blockedHashReason = blockedInputHashes.get(inputHash);
  if (blockedHashReason) {
    throw new Error(
      `Input file "${fileName}" is rejected because it matches a ${blockedHashReason}. Replace it with a real iOS Driver App screenshot from build 1.2.3 / 2 or a real iOS simulator/device run of that build.`,
    );
  }

  const metadata = await sharp(filePath).metadata();
  const { format, width, height } = metadata;

  if (format !== "png") {
    throw new Error(`Input file "${fileName}" must be a PNG. Detected format: ${format ?? "unknown"}.`);
  }

  if (!width || !height) {
    throw new Error(`Input file "${fileName}" has unreadable dimensions.`);
  }

  if (width >= height) {
    throw new Error(`Input file "${fileName}" must be portrait. Detected ${width}x${height}.`);
  }

  const ratio = width / height;
  const sizeKey = `${width}x${height}`;
  const looksLikeModernIphone = height >= 1700 && ratio >= 0.43 && ratio <= 0.52;

  if (!knownIosPhonePortraitSizes.has(sizeKey) && !looksLikeModernIphone) {
    throw new Error(
      `Input file "${fileName}" does not look like a portrait iOS phone screenshot. Detected ${width}x${height}. Use real iPhone screenshots from the Driver app build.`,
    );
  }
}

async function renderScreenshot(sharp: SharpFactory, inputPath: string): Promise<Buffer> {
  const resized = await sharp(inputPath)
    .resize({
      width: DEVICE.screenWidth,
      height: DEVICE.screenHeight,
      fit: "cover",
      position: "top",
      background: "#080A0B",
    })
    .png()
    .toBuffer();

  return sharp(resized)
    .composite([{ input: roundedMaskSvg(), blend: "dest-in" }])
    .png()
    .toBuffer();
}

async function renderSlide(sharp: SharpFactory, inputPath: string, slide: Slide, index: number, outputDir: string) {
  const screenshot = await renderScreenshot(sharp, inputPath);
  const outputPath = path.join(outputDir, slide.output);

  await sharp({
    create: {
      width: OUTPUT_WIDTH,
      height: OUTPUT_HEIGHT,
      channels: 4,
      background: "#101214",
    },
  })
    .composite([
      { input: backgroundSvg(), left: 0, top: 0 },
      { input: textBlockSvg(slide, index), left: 0, top: 0 },
      { input: deviceBaseSvg(), left: DEVICE.x, top: DEVICE.y },
      {
        input: screenshot,
        left: DEVICE.x + DEVICE.screenX,
        top: DEVICE.y + DEVICE.screenY,
      },
      { input: deviceOverlaySvg(), left: DEVICE.x, top: DEVICE.y },
    ])
    .png({ compressionLevel: 9 })
    .toFile(outputPath);

  const metadata = await sharp(outputPath).metadata();
  if (metadata.format !== "png" || metadata.width !== OUTPUT_WIDTH || metadata.height !== OUTPUT_HEIGHT) {
    throw new Error(
      `Failed export validation for "${slide.output}". Expected ${OUTPUT_WIDTH}x${OUTPUT_HEIGHT} PNG, got ${metadata.width ?? "?"}x${metadata.height ?? "?"} ${metadata.format ?? "unknown"}.`,
    );
  }

  return outputPath;
}

async function main() {
  const sharp = await loadSharp();
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const inputDir = path.join(scriptDir, "input");
  const outputDir = path.join(scriptDir, "output");

  await mkdir(inputDir, { recursive: true });
  await mkdir(outputDir, { recursive: true });

  const inputFiles = await listInputPngs(inputDir);

  for (const inputFile of inputFiles) {
    await validateInputScreenshot(sharp, inputFile);
  }

  const outputs: string[] = [];
  for (const [index, slide] of slides.entries()) {
    outputs.push(await renderSlide(sharp, inputFiles[index], slide, index, outputDir));
  }

  console.log(`Generated ${outputs.length} iOS Driver App Store screenshots:`);
  for (const output of outputs) {
    console.log(`- ${path.relative(process.cwd(), output)}`);
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`App Store screenshot generation failed:\n${message}`);
  process.exitCode = 1;
});
