/**
 * Run after deploy to notify Google of the sitemap.
 * Usage: node scripts/ping-google.mjs
 */

const SITEMAP_URL = 'https://www.247moglasgow.uk/sitemap.xml';

async function ping() {
  const pingUrl = `https://www.google.com/ping?sitemap=${encodeURIComponent(SITEMAP_URL)}`;
  console.log(`Pinging Google with sitemap: ${SITEMAP_URL}`);
  const res = await fetch(pingUrl);
  if (res.ok) {
    console.log('✓ Google pinged successfully — sitemap submitted for crawling.');
  } else {
    console.error(`✗ Ping failed: ${res.status} ${res.statusText}`);
    process.exit(1);
  }
}

ping();
