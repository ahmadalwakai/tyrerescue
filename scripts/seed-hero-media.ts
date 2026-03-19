/**
 * Seed the homepage_media table with the 8 existing hero slides.
 * Run with: npm run db:seed-hero
 */
import { neon } from '@neondatabase/serverless';
import { drizzle } from 'drizzle-orm/neon-http';
import * as schema from '../lib/db/schema';

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const slides = [
  {
    src: '/images/home/slide-1.png',
    alt: 'Tyre Rescue mobile tyre fitting service — professional technician at work',
    eyebrow: 'MOBILE FITTING',
    title: 'We Come to You',
    caption: 'Glasgow & Edinburgh — 24/7',
    objectPosition: 'center center',
    sortOrder: 0,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-2.png',
    alt: 'Tyre Rescue emergency roadside tyre assistance',
    eyebrow: 'EMERGENCY CALLOUT',
    title: '45 Min Response',
    caption: "Stranded? We'll be there fast.",
    objectPosition: 'center center',
    sortOrder: 1,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-3.png',
    alt: 'Professional tyre fitting on a customer driveway',
    eyebrow: 'DRIVEWAY SERVICE',
    title: 'At Your Door',
    caption: 'Home, work, or roadside',
    objectPosition: 'center center',
    sortOrder: 2,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-4.png',
    alt: 'Close-up of a premium tyre and alloy wheel fitted by Tyre Rescue',
    eyebrow: 'QUALITY TYRES',
    title: 'Premium Brands',
    caption: 'Budget to premium — all sizes in stock',
    objectPosition: 'center center',
    sortOrder: 3,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-5.png',
    alt: 'Tyre Rescue branded service van ready for dispatch',
    eyebrow: 'FAST DISPATCH',
    title: 'Always Ready',
    caption: 'Fully stocked vans across Scotland',
    objectPosition: 'center center',
    sortOrder: 4,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-6.png',
    alt: 'Technician inspecting tyre tread during a mobile fitting appointment',
    eyebrow: 'EXPERT FITTERS',
    title: 'Certified Team',
    caption: 'Fully insured & experienced',
    objectPosition: 'center center',
    sortOrder: 5,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-7.png',
    alt: 'Customer vehicle receiving a tyre change at home in Glasgow',
    eyebrow: 'CONVENIENCE',
    title: 'No Garage Needed',
    caption: 'We bring the workshop to you',
    objectPosition: 'center center',
    sortOrder: 6,
    animationStyle: 'fadeZoom',
  },
  {
    src: '/images/home/slide-8.png',
    alt: 'Tyre Rescue completing a roadside tyre rescue safely',
    eyebrow: 'ROADSIDE RESCUE',
    title: 'Safe & Professional',
    caption: '£2M public liability cover',
    objectPosition: 'center center',
    sortOrder: 7,
    animationStyle: 'fadeZoom',
  },
];

async function main() {
  console.log('Seeding homepage_media table...');

  // Check if rows already exist
  const existing = await db.select().from(schema.homepageMedia);
  if (existing.length > 0) {
    console.log(`Table already has ${existing.length} rows. Skipping seed.`);
    return;
  }

  for (const slide of slides) {
    await db.insert(schema.homepageMedia).values(slide);
    console.log(`  ✓ ${slide.title}`);
  }

  console.log(`Done — ${slides.length} slides inserted.`);
}

main().catch(console.error);
