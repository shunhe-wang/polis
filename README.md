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

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

Copy `.env.example` to `.env.local`, then add your Z.AI key as
`ZAI_API_KEY`. Polis uses `glm-5.2` by default; `ZAI_MODEL` can override the
text model without a code change.

For admin cost estimates, set `ZAI_INPUT_USD_PER_MILLION`,
`ZAI_OUTPUT_USD_PER_MILLION`, and `ZAI_WEB_SEARCH_USD_PER_USE` from Z.AI's
current pricing page. Leave them unset rather than guessing when the configured
model is not listed.

The production deployment runs a daily Google Civic health probe. Set a strong
`CRON_SECRET` and `ELECTION_FRESHNESS_PROBE_ADDRESS` to a stable, public test
address whose expected ballot availability is understood by the operations
team. The address is used for the lookup but is not written to operational logs.

iOS purchases use StoreKit while web purchases remain on Stripe. The required
App Store Connect setup, server variables, and native transaction contract are
documented in [`docs/app-store-commercial-route.md`](docs/app-store-commercial-route.md).

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
