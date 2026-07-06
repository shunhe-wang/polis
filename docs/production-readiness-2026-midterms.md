# Polis production and App Store readiness plan

**Prepared:** July 4, 2026  
**Last updated:** July 6, 2026
**Election day:** November 3, 2026[^fec]  
**Runway:** 120 days

## Current status at a glance

- **Closed launch blockers:** client-writable credits/quotas, in-app account deletion, explicit AI-data consent, vulnerable Next.js pin, and unreliable/unmetered research prefetch.
- **Commercial route selected:** StoreKit server verification and atomic fulfillment are implemented; the native client, notifications/refunds, App Store Connect setup, and sandbox/TestFlight proof remain.
- **Account recovery implemented:** reset request, PKCE callback, new-password page, open-redirect protection, and a Supabase recovery template are in the repository. Production SMTP/template configuration and a real-inbox test remain.
- **Web UX:** the signed-in mobile header now uses a compact menu, and `tsc --noEmit` is clean across application and test files.
- **Ballot data decision:** Google Civic remains a best-effort convenience source. Official sample-ballot upload/paste plus review is the deterministic fallback; a licensed-provider bake-off remains a prelaunch business decision.
- **Overall:** the web foundation is materially safer, but Polis is not production/App Store ready until the native client, live payment testing, ballot coverage/quality evidence, external alerting, and release operations are complete.

## Executive recommendation

Polis can plausibly launch before the 2026 midterms, but the critical path is not the iOS wrapper. It is:

1. close authorization and privacy blockers;
2. prove election-data accuracy and operational reliability on the web;
3. make a deliberate iOS payment decision;
4. ship a genuinely app-like iOS client through TestFlight by early September;
5. submit to App Review by mid-September and target public launch by September 26.

The safest business path is to keep Stripe on the web and implement StoreKit purchases for iOS. The fastest launch path is a free, rate-limited iOS edition through Election Day, with no purchase UI. A thin wrapper around the hosted website is not recommended: Apple says an app must provide utility beyond a repackaged website, and thin clients may not be appropriate for the store.[^apple-review]

## Production blockers found in the current repository

### P0: users can directly grant themselves credits

`supabase/migrations/008_entitlement_billing.sql` gives authenticated users `insert` and `update` access to their own `account_entitlements` row. Because the policy does not restrict writable columns, a signed-in client can set `election_pass_credits` directly. Remove direct client insert/update policies and mutate entitlements only through narrowly granted, server-validated functions.

**Implementation status (July 5):** complete. Migration `017_lock_down_entitlements_and_quotas.sql` is applied remotely. An authenticated adversarial test confirmed direct entitlement writes now fail with PostgreSQL `42501`.

### P0: users can reset their own AI quotas

`supabase/migrations/004_ai_quotas.sql` gives authenticated users direct insert/update access to `ai_usage_counters`. A client can lower its usage state and bypass the intended limits. Remove direct writes and keep quota mutation behind the atomic RPC.

**Implementation status (July 5):** complete. Migration `017` converts quota enforcement to a security-definer function and revokes direct table writes. An authenticated adversarial test confirmed table writes fail with `42501` while the scoped quota RPC still succeeds.

### P0: no in-app account deletion

The repository has no account-deletion UI or backend flow. Apple requires apps that support account creation to offer account deletion from within the app.[^apple-review]

Deletion should revoke sessions, delete the Supabase auth user, cascade user-owned rows, and define what billing/audit records are retained for legal purposes. The existing privacy policy's email-only deletion request is not enough for App Review.

**Implementation status (July 5):** complete in the repository. The authenticated Account page requires the signed-in email, current password, and exact `DELETE` phrase. The server attempts Stripe customer cleanup, deletes the Supabase auth user, and relies on database cascades for user-owned rows. A live browser test confirmed rejection of a wrong password and a final 404 from the Supabase Admin API after deletion.

### P0: no explicit consent before third-party AI processing

Polis sends issue priorities, free-text values, political identity, ballot context, and uploaded ballot content to Z.AI. Apple requires disclosure of where personal data is shared, including third-party AI, and explicit permission before sharing it.[^apple-review]

Add a consent screen immediately before the first AI request. It should name Z.AI, summarize the transmitted data, link to the privacy policy, allow cancellation, and record the consent version and timestamp. Update the privacy policy for the actual Z.AI data flow and retention terms.

**Implementation status (July 5):** complete. The disclosure screen, consent API, current-version enforcement across every Z.AI route, revocation control, browser redirect, and privacy-policy update are live. Migration `018_ai_data_consent.sql` is applied remotely, and a real browser test verified grant, revoke, and re-grant persistence.

### P0: vulnerable Next.js release

The repository pins `next@16.2.1`. The July 4 `npm audit` reports high-severity advisories and identifies `16.2.10` as the non-major fix. Upgrade Next.js and the matching ESLint config, then rerun unit, browser, and production-build verification.

**Implementation status (July 5):** upgraded to the latest stable `next@16.2.10` and matching ESLint config, with Node 22.13 pinned. Nonbreaking audit fixes reduced production findings from high severity to two moderate findings inside the latest stable Next/PostCSS tree. Monitor for the next patched stable release rather than accepting npm's unsafe downgrade suggestion to Next 9.3.3.

### P1: unmetered, unreliable AI prefetch

`src/app/api/research/prefetch/route.ts` can initiate paid dossier generation without enforcing AI quotas. It also starts work with `void runWithConcurrencyLimit(...)` and returns immediately; serverless execution may end before that work completes. Meter it and either await it or use Next.js `after()`/a durable queue.

**Implementation status (July 5):** complete. Prefetch now checks consent, meters only uncached work with user and connection quotas, awaits the bounded worker pool within a declared 60-second route duration, records provider failures, and reports success only for valid saved dossiers.

### P1: operational controls are still placeholders

The admin dashboard reports zeroes and labels API usage as “Not yet wired.” Before launch, add provider cost/latency/error dashboards, Stripe/StoreKit fulfillment reconciliation, queue depth, quota denials, and election-data freshness. Configure external error reporting and alerts rather than relying only on database event logs.

**Implementation status (July 5):** partially complete. The restricted dashboard now reports real user, saved-guide, research, Z.AI call/error/latency/token/cost, web revenue, unfulfilled-order, recorded quota-denial, recent-error, and election-data freshness metrics. Live provider telemetry was verified through the candidate route. A daily authenticated production cron probes the Google Civic ballot path and reports healthy, degraded, failed, or stale status without logging the configured address. Migration `019_backfill_legacy_billing_fulfillment.sql` repairs fulfillment bookkeeping for orders created before the atomic checkout migration. Cost estimates remain disabled until current model rates are configured. External error reporting, alert delivery, queue depth, and StoreKit reconciliation remain outstanding.

### P1: password accounts had no recovery path

Password users could sign in and delete an account, but a forgotten password made the account inaccessible.

**Implementation status (July 6):** repository work is complete. `/auth/forgot-password` sends a non-enumerating Supabase recovery request, `/auth/callback` exchanges the PKCE code and now rejects external redirect targets, and `/auth/reset-password` validates the session and updates the password. The production recovery email is in `supabase/templates/recovery.html`; exact dashboard, redirect URL, SMTP, and inbox-test steps are in `docs/supabase-password-recovery.md`. This remains a deployment verification item until the hosted template and custom SMTP are configured and a real recovery link is exercised.

### P2: signed-in mobile navigation wrapped into two rows

**Implementation status (July 6):** complete in the repository. Desktop retains the full navigation, while smaller viewports use a compact accessible menu with the signed-in destinations, purchase path, and sign-out action. Browser coverage checks the 390-pixel signed-in layout.

### P2: test files failed the standalone TypeScript gate

**Implementation status (July 6):** complete. Environment mutation now uses Vitest's typed environment stubs, the account-trust boundary reflects Supabase's nullable confirmation field, and persistence mocks use an explicit test-boundary cast. `npx tsc --noEmit` is clean.

## App Store decisions

### Payments

Election Pass credits unlock digital functionality consumed inside the app. Apple says these unlocks must use In-App Purchase; it also says purchased credits may not expire.[^apple-review] Existing web purchases can remain on Stripe, but a multiplatform service generally needs the same items available as IAP in the app.[^apple-review]

The two implementation options considered were:

- **Recommended commercial route:** add StoreKit consumable credit products for iOS; verify App Store transactions server-side; grant credits idempotently into the existing entitlement ledger; keep Stripe only on web.
- **Fastest route:** make the iOS edition free and rate-limited through November 3, remove all iOS purchase links and purchased-credit dependencies, and revisit monetization after the election.

**Decision (July 6):** selected the recommended commercial route. The backend
now verifies Apple-signed consumable transactions, binds purchases to the Polis
account through `appAccountToken`, and atomically grants idempotent Election Pass
credits. Migration `020_app_store_transaction_fulfillment.sql` adds the ledger
and fulfillment function; migration `021_harden_app_store_idempotency.sql`
rejects replays whose immutable transaction data changed. App Store Connect product setup, the native StoreKit
client, server notifications/refunds, and sandbox/TestFlight validation remain.

Although current U.S. storefront rules permit external purchase links in more situations, relying on that interpretation for a first, time-sensitive review is higher risk than StoreKit.

### Mobile architecture

Use Capacitor as the native runtime, but do not submit a remote website in a shell. Capacitor is designed to be added to an existing web project and expose native APIs.[^capacitor] Build and bundle a mobile-oriented client that calls the existing hosted Next.js APIs.

Include at least a small native value layer:

- secure session storage;
- native share sheet for guides;
- deep links to saved guides;
- election reminders or push notifications;
- offline access to the user's saved guide;
- native file/photo picker for ballot uploads;
- StoreKit for paid iOS credits.

Keep the Next.js/Vercel app as the API and web surface. Do not embed server secrets in the mobile bundle.

### Identity

The current app uses first-party email/password authentication, so Apple’s equivalent-login requirement does not force Sign in with Apple. If Google, Facebook, or another social login is added, revisit Guideline 4.8.[^apple-review]

### Store metadata and review package

Prepare:

- organization Apple Developer enrollment under **Atelier SW LLC**, not the Polis DBA;
- D-U-N-S record, binding authority, work-domain email, and functioning company website—Apple does not accept DBAs as the enrolled legal entity;[^apple-enrollment]
- privacy policy URL and accurate Privacy Nutrition Label covering account/email, physical address, political/value inputs, purchases, usage, diagnostics, and third-party processing;[^apple-privacy]
- support URL, screenshots, description, age rating, export-compliance answers, and review notes;
- a permanent App Review demo account with a representative ballot, available credit, and instructions for the AI flow;
- visible “not an official election authority” language and direct links to official state/local election sources.

## Election-data and AI quality gate

Google Civic's current public documentation still exposes election and voter-information queries for supported elections.[^google-civic] That does not make it a complete exact-ballot feed: local, precinct-specific, and not-yet-published contests can be absent. Polis will therefore keep it as a best-effort convenience lookup rather than a launch-critical guarantee.

When a voter has an official sample ballot, the recommended path is now upload/paste, editable draft review, and retained source/confidence metadata. Manual entry remains the no-AI fallback. Before signing a licensed feed, run a representative-address bake-off covering exact-ballot resolution, local/judicial/measure coverage, provenance, corrections, SLA, retention rights, and total price. Democracy Works publishes a commercial Elections API and is a concrete candidate for that evaluation.[^democracy-works] The decision record is `docs/ballot-data-source-strategy.md`.

Before public launch:

- build a 50-state coverage matrix using representative addresses;
- record which races/measures came from official sources, uploaded ballots, deterministic fallback, or AI;
- never present AI-generated election dates, registration rules, polling locations, or official ballot text as authoritative;
- display source and retrieval time beside material claims;
- create a correction/report flow and a rapid takedown procedure;
- run a recurring golden-set evaluation for hallucination, wrong-party attribution, stale candidacies, missing races, and partisan skew;
- freeze model/prompt versions during the final two weeks except for urgent corrections;
- link users to state/local election officials for official procedures. The EAC describes state and local election officials as the trusted source for official voting information.[^eac]

## Infrastructure release gate

Before production traffic:

- separate development, staging, and production Supabase/Vercel projects and secrets;
- apply every migration to staging from a clean database, then test rollback and restore;
- verify RLS table-by-table with authenticated adversarial tests;
- patch dependencies and pin a supported Node version;
- configure custom domain, DNS, TLS, email deliverability, and Supabase redirect URLs;
- install the recovery email template, configure custom SMTP, and test reset links against production and staging redirects;
- configure production Stripe webhooks and idempotent reconciliation;
- set Z.AI spend caps, timeouts, retries with jitter, and a degraded mode when AI is unavailable;
- load-test candidate lookup, ballot parsing, research streaming, and webhook fulfillment;
- add uptime, latency, error-rate, spend, and data-freshness alerts;
- write incident, data-correction, provider-outage, and election-night runbooks;
- exercise database backup restoration, not merely enable backups.

## Dated delivery plan

### July 4–17: close launch blockers

- Enroll Atelier SW LLC in the Apple Developer Program immediately. A new D-U-N-S number can take up to five business days, followed by up to two business days for Apple to receive it.[^apple-duns]
- Fix entitlement/quota RLS, account deletion, AI consent, Next.js security update, prefetch metering, and privacy-policy accuracy.
- Decide free-iOS versus StoreKit.
- Deploy a staging environment from a clean database.

### July 18–August 7: production web beta

- Finish monitoring, error reporting, backups, provider budgets, rate limits, and admin operations.
- Run national ballot coverage and AI quality tests.
- Recruit 25–50 testers across several states and political viewpoints.
- Freeze the v1 feature set.

### August 8–28: iOS client

- Build the bundled Capacitor client and native-value features.
- Add StoreKit and server verification if using paid iOS credits.
- Complete deletion, consent, privacy controls, accessibility, and on-device testing.

### August 29–September 11: TestFlight

- Start internal TestFlight, then external testing. Apple permits up to 100 internal and 10,000 external testers; the first external build may require beta review.[^testflight]
- Test poor networks, expired sessions, payment retries, duplicate webhooks/transactions, large ballots, model outages, and accessibility.
- Prepare screenshots, review account, privacy label, and review notes.

### September 12: submit v1

Submit the app and any IAP products together. Apple expects a final, on-device-tested build, live backend, functional URLs, and review credentials.[^apple-review]

### September 26: target public launch

This leaves roughly five weeks for adoption and two review/fix cycles before November 3. October should be stabilization, content correction, source freshness, and support—not feature expansion.

## Definition of “ready”

Do not call the product production-ready until all of these are true:

- no client-writable credits or quotas;
- password reset succeeds through a real production inbox and expired links fail safely;
- account deletion works end-to-end;
- explicit AI data-sharing consent is recorded;
- privacy policy and App Store disclosures match actual behavior;
- Next.js and production dependencies are patched;
- iOS payment path has passed sandbox purchase, duplicate-delivery, refund, and restore/account tests;
- 50-state coverage limits are documented and shown honestly in-product;
- core AI outputs pass a versioned quality benchmark;
- staging restore, provider outage, and payment reconciliation drills have succeeded;
- TestFlight has no open P0/P1 defects;
- App Review receives a working demo account and complete instructions.

## Primary sources

[^apple-review]: Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
[^apple-enrollment]: Apple, [Apple Developer Program enrollment](https://developer.apple.com/help/account/membership/program-enrollment).
[^apple-duns]: Apple, [D-U-N-S Number](https://developer.apple.com/help/account/membership/D-U-N-S).
[^apple-privacy]: Apple, [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy) and [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).
[^testflight]: Apple, [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
[^capacitor]: Ionic, [Capacitor documentation](https://capacitorjs.com/docs).
[^google-civic]: Google, [Civic Information API voterInfoQuery](https://developers.google.com/civic-information/docs/v2/elections/voterInfoQuery).
[^democracy-works]: Democracy Works, [Elections API](https://www.democracy.works/elections-api).
[^eac]: U.S. Election Assistance Commission, [Voting 101: Election Information for New Voters](https://www.eac.gov/sites/default/files/2024-12/Voting_101_Flyer_Full_Page_508.pdf).
[^fec]: Federal Election Commission, [2026 congressional primary dates and candidate filing deadlines](https://www.fec.gov/resources/cms-content/documents/2026pdates.pdf).
