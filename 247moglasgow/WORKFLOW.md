# 247 Mo Glasgow — Build Workflow

Execute these steps in order. Each step depends on the previous.

## Phase 1 — Setup (Steps 1–5)
1. Scaffold Next.js app in this folder
2. Create .env.local (copy keys from Tyre Rescue .env)
3. Install dependencies
4. Create lib/db.ts (shared Neon DB)
5. Create lib/brand.ts + lib/seo-data.ts + lib/schemas.ts

## Phase 2 — Register in Parent (Steps 3a–3e)
- Edit `../lib/integrations/project-sources.ts` → add 247_mo_glasgow
- Edit `../lib/integrations/project-links.ts` → add route slug
- Edit `../lib/integrations/project-pricing-origin.ts` → add pricing origin
- Edit `../assisted-chat-app/src/lib/project-config.ts` → add to ProjectId + PROJECTS
- Create `../app/api/integrations/247-mo-glasgow/bookings/route.ts`

## Phase 3 — Core App Shell (Steps 8–11)
- app/layout.tsx + app/globals.css
- components/JsonLd.tsx
- components/Nav.tsx
- components/Footer.tsx

## Phase 4 — Pages (Steps 12–19)
- app/page.tsx (homepage — most important)
- app/[service]/page.tsx (4 service landing pages)
- app/[service]/[area]/page.tsx (120 area pages)
- app/emergency/page.tsx
- app/book/page.tsx
- app/areas/page.tsx

## Phase 5 — SEO Infrastructure (Steps 14–15)
- app/sitemap.ts
- app/robots.ts

## Phase 6 — API (Step 16)
- app/api/booking/route.ts

## Phase 7 — Config & Verification (Steps 20–25)
- next.config.ts
- vercel.json
- package.json scripts
- tailwind.config.ts
- tsconfig.json
- Run verification checklist

---

## Key Constraints

- Port: 3010 (dev server)
- Source app key: `247_mo_glasgow`
- Domain: `www.247moglasgow.uk`
- DB: same Neon DATABASE_URL as Tyre Rescue (do not create new tables)
- Bookings: POST to Tyre Rescue backend, do not duplicate booking logic
- All SEO content must be server-rendered (no 'use client' on content sections)
- Animations: Framer Motion, client components only, never block SSR
