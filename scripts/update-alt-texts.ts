/**
 * One-time script to update hero slide alt texts in the database.
 * Run: npx tsx scripts/update-alt-texts.ts
 */
import { config } from 'dotenv';
config({ path: '.env.local' });
import { db } from '../lib/db';
import { homepageMedia } from '../lib/db/schema';
import { eq } from 'drizzle-orm';

const altTextUpdates: Record<string, string> = {
  '/images/home/slide-1.png': 'Tyre technician fitting a new tyre on a customer vehicle at their driveway',
  '/images/home/slide-2.png': 'Emergency roadside tyre change being performed on a dark motorway hard shoulder',
  '/images/home/slide-3.png': 'Mobile fitter using a hydraulic jack to lift a car for tyre replacement at home',
  '/images/home/slide-4.png': 'Close-up of a freshly fitted premium tyre on a polished alloy wheel',
  '/images/home/slide-5.png': 'White mobile tyre fitting van equipped and ready for callout in Glasgow',
  '/images/home/slide-6.png': 'Gloved hand checking tyre tread depth with a gauge during inspection',
  '/images/home/slide-7.png': 'Sedan on a residential street in Glasgow receiving a front tyre replacement',
  '/images/home/slide-8.png': 'Technician tightening wheel bolts after completing an emergency tyre change',
};

async function main() {
  // Fetch current slides
  const slides = await db.select({ id: homepageMedia.id, src: homepageMedia.src, alt: homepageMedia.alt }).from(homepageMedia);
  
  console.log(`Found ${slides.length} slides in database\n`);

  let updated = 0;
  for (const slide of slides) {
    // Match by src path (may be full URL or relative path)
    const matchingSrc = Object.keys(altTextUpdates).find(key => slide.src.includes(key));
    if (matchingSrc && slide.alt !== altTextUpdates[matchingSrc]) {
      console.log(`Updating slide ${slide.id}:`);
      console.log(`  src: ${slide.src}`);
      console.log(`  old alt: ${slide.alt}`);
      console.log(`  new alt: ${altTextUpdates[matchingSrc]}\n`);
      
      await db.update(homepageMedia)
        .set({ alt: altTextUpdates[matchingSrc], updatedAt: new Date() })
        .where(eq(homepageMedia.id, slide.id));
      updated++;
    } else if (matchingSrc) {
      console.log(`Slide ${slide.id} already has correct alt text — skipping`);
    } else {
      console.log(`Slide ${slide.id} (${slide.src}) — no matching alt text update found`);
    }
  }

  console.log(`\nDone. Updated ${updated} slides.`);
  process.exit(0);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
