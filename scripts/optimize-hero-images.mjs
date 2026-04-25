/**
 * One-time script to convert /public/images/home/slide-*.png hero images
 * to optimized WebP. PNGs are 2-3MB each which destroys LCP.
 *
 * Output: slide-N.webp (~150-300 KB) at max width 1600px.
 * Originals are preserved in case rollback is needed.
 *
 * Run with:  node scripts/optimize-hero-images.mjs
 */
import { promises as fs } from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';

const HOME_DIR = path.resolve('public/images/home');
const MAX_WIDTH = 1600;
const QUALITY = 72;

async function main() {
  const files = (await fs.readdir(HOME_DIR)).filter((f) => /^slide-\d+\.png$/i.test(f));
  if (files.length === 0) {
    console.log('No slide PNGs found. Nothing to do.');
    return;
  }

  let totalIn = 0;
  let totalOut = 0;

  for (const file of files.sort()) {
    const inPath = path.join(HOME_DIR, file);
    const outPath = path.join(HOME_DIR, file.replace(/\.png$/i, '.webp'));
    const inStat = await fs.stat(inPath);
    totalIn += inStat.size;

    await sharp(inPath)
      .resize({ width: MAX_WIDTH, withoutEnlargement: true })
      .webp({ quality: QUALITY, effort: 6 })
      .toFile(outPath);

    const outStat = await fs.stat(outPath);
    totalOut += outStat.size;
    const reduction = (100 - (outStat.size / inStat.size) * 100).toFixed(1);
    console.log(
      `${file} -> ${path.basename(outPath)}  ${(inStat.size / 1024).toFixed(0)} KB -> ${(outStat.size / 1024).toFixed(0)} KB  (-${reduction}%)`,
    );
  }

  console.log(
    `\nTotal: ${(totalIn / 1024 / 1024).toFixed(2)} MB -> ${(totalOut / 1024 / 1024).toFixed(2)} MB  (-${(100 - (totalOut / totalIn) * 100).toFixed(1)}%)`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
