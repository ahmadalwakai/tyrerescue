This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3002](http://localhost:3002) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## VRM tyre fitment lookup

The quote VRM endpoint uses DVLA Vehicle Enquiry Service for vehicle identity and Tyre Rescue-owned local data for tyre-fitment guidance:

```bash
NEXT_PUBLIC_VRM_ENABLED=true
DVLA_API_KEY=...
GROQ_API_KEY=...
```

DVLA does not provide tyre sizes. The app can show locally confirmed registration fitments and non-comprehensive make/model/year catalogue candidates, but booking and pricing require the operator to confirm the tyre sidewall first. `GROQ_API_KEY` is optional and may only rank/explain existing local candidates; it must not invent tyre sizes or source fitment data.

Tyre Rescue also has a self-owned exact-registration catalog at `lib/data/vrm-tyre-fitments.json`. Add a record there only after the tyre has been confirmed from the sidewall, door placard, manufacturer data, or a paid fitment source:

```json
{
  "registrationNumber": "AB12CDE",
  "options": [
    {
      "label": "Confirmed sidewall fitment",
      "front": "215/55R16",
      "rear": "215/55R16",
      "confidence": "high",
      "notes": ["Confirmed by admin"]
    }
  ]
}
```

Do not add third-party vehicle-fitment APIs or scraping to this flow. Confirmed sidewall data should be saved through Assisted Chat or added to the owned local catalogue after review.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
