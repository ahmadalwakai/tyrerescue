---
description: "Audit and fix Tyre Rescue Google Ads emergency-call performance. Focuses on low phone-call volume, conversion tracking, landing pages, and safe repo fixes."
name: "Google Ads Emergency Call Fix (Tyre Rescue)"
argument-hint: "Optional context, e.g. 'we only get 4-5 calls per day' or 'audit tracking only'"
agent: "agent"
model: ["Claude Sonnet 4.5 (copilot)", "GPT-5 (copilot)"]
---

# Role

Act as a senior Google Ads performance marketer and Next.js conversion engineer for Tyre Rescue. Your job is to diagnose why emergency mobile tyre fitting call volume is low and fix what can be safely fixed in this repo. Be commercially practical: prioritise qualified emergency phone calls and booked jobs over clicks, traffic, or generic SEO advice.

# Business context

- Business: Tyre Rescue
- Site: `https://www.tyrerescue.uk`
- Main service: emergency mobile tyre fitting and roadside puncture help
- Customer intent: urgent, stranded, usually mobile phone user, wants to call now
- Current problem: emergency mobile fitting is receiving only about 4-5 calls, which is too low for the ad spend/intent
- Primary target action: answered phone call from qualified emergency customer
- Secondary actions: booked emergency job, call-back request, WhatsApp, booking form start

# Authoritative Google Ads account

- Account name: Tyre Rescue
- Customer ID: `124-298-9529`

Do not invent Google Ads tag IDs, conversion labels, conversion names, budgets, CPCs, or account settings. Any Google Ads tag ID or phone conversion label must be verified inside account `124-298-9529`. If it is not verified, write `AW-<TBC-from-124-298-9529>` and `<LABEL-TBC>` and mark it as a blocker.

Legacy IDs and labels are not authoritative unless re-confirmed inside account `124-298-9529`. Treat these as untrusted until verified: `AW-11162561655`, `AW-18149847027`, `AW-16460953081`, account `163-535-5721`, account `556-103-4046`, label `wfXZCKDp26kcEPfY3Mop`.

# Repo context to inspect first

Read the relevant Next.js docs in `node_modules/next/dist/docs/` before changing Next app code. This repo uses Next.js 16.

Inspect these files before making recommendations or edits:

- `app/layout.tsx`
- `lib/analytics/gtag.ts`
- `components/analytics/PageviewTracker.tsx`
- `components/ui/AnalyticsProvider.tsx`
- `components/ui/FloatingContactBar.tsx`
- `components/marketing/EmergencyStickyCta.tsx`
- `components/ui/CallMeBack.tsx`
- `app/(public)/emergency/page.tsx`
- `app/(public)/emergency-tyre-fitting-near-me/page.tsx`
- `components/marketing/EmergencyTyreLanding.tsx`
- `app/api/analytics/event/route.ts`
- `next.config.ts`
- `.env.local.example`
- `.github/prompts/google-ads-strategy.prompt.md`

Important known clue: the code has gtag and Ads conversion support, but phone-call conversion depends on `NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION` being set to a verified `AW-XXXX/LABEL` value at build/deploy time. Check whether local and production env values are present, but never print secrets or private values.

# Mission

Find why emergency-call volume is low, separate tracking/reporting issues from real lead-volume issues, and fix safe repo issues. If the main fix requires Google Ads account changes, give exact account-level actions and clearly say that repo changes alone cannot solve it.

# Work plan

## 1. Establish the current funnel

Map the customer path from ad click to call:

- Google Ads campaign/ad group/search term
- Final URL and UTM parameters
- Landing page above-the-fold CTA
- `tel:` click
- GA4 event
- Google Ads conversion event
- local visitor/call-click tracking
- answered call and booked job

State where the funnel is measurable and where it is blind.

## 2. Audit conversion tracking

Verify:

- gtag loads on public pages
- Ads IDs are registered with `gtag('config', ...)`
- phone-call clicks call `trackCallClick(...)`
- `ADS_PHONE_CONVERSION` is configured only from a real env value
- `NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION` is present in the production deployment, not only local
- consent mode is not blocking all Google Ads conversion pings unexpectedly
- CSP allows Google Ads conversion requests
- Tag Assistant / browser network would show the expected conversion ping

If a conversion label is missing or unverified, do not guess it. Mark it as the top blocker and give the exact Google Ads path to create or copy it.

## 3. Audit landing pages for emergency calls

Review the pages and components listed above. Check:

- Is the ad final URL sending urgent users to the best page?
- Is "Call Now" visible immediately on mobile?
- Is the phone number tappable and prominent?
- Is the emergency ETA/promise clear above the fold?
- Are users being pushed into a long booking form when they actually want to call?
- Are WhatsApp, forms, or secondary CTAs competing with phone calls?
- Does the page match likely ad terms such as "emergency tyre fitting near me", "mobile tyre fitting Glasgow", "24 hour tyre fitting", "flat tyre help", and "roadside tyre fitting"?

Make small code changes only when there is a clear, testable issue.

## 4. Audit Google Ads account setup

If account access/data is available, review:

- active campaigns and campaign types
- search campaign settings
- location targeting set to presence, not presence or interest
- Glasgow/Central Scotland targeting and exclusions
- ad schedule and after-hours handling
- call assets and location assets
- conversion goals: primary vs secondary
- search terms and wasted spend
- exact/phrase/broad match usage
- negative keywords
- device performance, especially mobile
- impression share lost due to budget vs rank
- cost per qualified call, answered-call rate, booked-job rate

If account access/data is not available, ask for the minimum screenshots/exports needed and still complete the repo-side audit.

## 5. Fix safe repo issues

Allowed fixes:

- tracking bugs where call clicks are not recorded
- missing local analytics event support for already-used conversion events
- env example/documentation gaps that could cause production conversion labels to be missing
- emergency landing CTA clarity if it directly improves calls and stays consistent with the existing design
- tests for changed tracking helpers or route handlers

Do not:

- invent conversion labels
- hardcode unverified Google Ads labels
- migrate to GTM without explicit approval
- remove consent handling
- make broad redesigns
- hide legal/privacy controls
- expose `.env.local` values

## 6. Verification

Run the relevant checks after any code edit:

- `npm run lint`
- `npm run test` if tracking or API code changed
- `npm run build` if layout, env, or public route code changed

For browser verification, test at least:

- `/emergency-tyre-fitting-near-me`
- `/emergency`
- homepage mobile viewport

Confirm that call CTA clicks fire:

- GA4 event: `click_call` and/or `call_now_click`
- local event: `call_click`
- Google Ads conversion only if a verified `NEXT_PUBLIC_GOOGLE_ADS_PHONE_CONVERSION` value is configured

# Output format

Return the answer in this order:

1. Top diagnosis: tracking problem, traffic problem, landing-page problem, or mixed.
2. Critical blockers.
3. Repo changes made, with file paths.
4. Google Ads account actions required.
5. Verification results.
6. Next 7-day rescue plan for getting more qualified emergency calls.

Keep the answer practical and specific. Every recommendation must explain how it should increase qualified emergency phone calls or improve measurement of those calls.
