# Polis production and App Store readiness plan

**Last updated:** July 7, 2026
**Election day:** November 3, 2026[^fec]  
**Runway:** 119 days

This document lists outstanding work only. Once an item is implemented and
verified, remove it rather than retaining a completion history.

## Current critical path

1. Merge and deploy [PR #2](https://github.com/shunhe-wang/polis/pull/2).
2. Finish production account-email configuration and prove password recovery
   through a real inbox.
3. Establish isolated staging and production environments, then exercise
   migrations, rollback, and backup restoration.
4. Build the native iOS client and complete StoreKit sandbox fulfillment from
   an actual device or TestFlight build.
5. Prove ballot coverage and AI quality with representative voters before
   inviting a public beta.
6. Finish alerting, incident response, App Store metadata, and review materials.

Supabase email setup is therefore one blocking lane, not the global blocker.
Native development, quality evaluation, operational tooling, and store-package
work can proceed in parallel.

## Actions requiring owner or external-account access

### Supabase email and recovery

- Set the production Site URL and narrowly allowlisted staging/production auth
  callback URLs.
- Paste `supabase/templates/recovery.html` into **Authentication → Email
  Templates → Reset Password**.
- Configure custom SMTP with a verified sending domain.
- Set the hosted minimum password length to at least eight characters.
- Request a reset through a controlled production inbox; verify the new
  password works, the old password fails, and expired/reused links fail safely.

The exact procedure is in `docs/supabase-password-recovery.md`.

### Apple and App Store Connect

- Complete Apple Developer organization enrollment under **Atelier SW LLC**,
  including D-U-N-S and binding-authority verification.[^apple-enrollment]
- Create the iOS app record, bundle identifier, and consumable Election Pass
  product in App Store Connect.
- Provide tax, banking, agreements, and required business information.
- Decide the support URL and public marketing/company website used during
  review.

### Commercial ballot-data decision

- Request coverage samples, licensing terms, SLA, caching/retention rights, and
  pricing from Democracy Works and at least one comparable provider.
- Do not sign or integrate a feed until a representative-address bake-off shows
  materially better exact-ballot coverage than the current official-upload
  fallback.

Evaluation criteria are in `docs/ballot-data-source-strategy.md`.

## Engineering work still open

### P0: native iOS application and StoreKit client

Build a bundled Capacitor client that calls the hosted Next.js APIs without
embedding server secrets. A remote website inside a shell is not sufficient for
App Review.[^apple-review][^capacitor]

Required v1 native value:

- secure session storage;
- StoreKit purchase UI and `appAccountToken` account binding;
- native file/photo picker for ballot uploads;
- native share sheet and deep links for saved guides;
- offline access to a previously saved guide;
- at least one useful election reminder or notification path.

Verify sandbox purchase, duplicate delivery, interrupted purchase, refund,
account switching, and restored session behavior on physical devices and
TestFlight.

### P0: staging and production release environments

- Separate development, staging, and production Supabase/Vercel projects and
  secrets.
- Apply all migrations to an empty staging database.
- Exercise rollback and database restoration rather than merely confirming that
  backups are enabled.
- Re-run authenticated RLS adversarial tests in staging.
- Configure production domains, TLS, redirects, Stripe webhooks, cron secrets,
  Z.AI budgets, Google Civic credentials, and mobile origins.
- Maintain an environment inventory that identifies the owner and rotation
  procedure for every production secret.

### P0: ballot coverage and AI quality evidence

Google Civic is a best-effort lookup for supported elections, not a guaranteed
exact-ballot feed.[^google-civic] Official sample-ballot upload/paste and manual
review remain the fallback.

Before public beta:

- build a 50-state matrix using representative urban, suburban, and rural
  addresses;
- record exact-ballot success, partial results, missing local contests, and
  official-upload recovery rates;
- retain source and retrieval time for material election claims;
- create a versioned golden set for hallucination, wrong-party attribution,
  stale candidacies, missing races, unsupported claims, and partisan skew;
- define minimum pass thresholds and freeze model/prompt versions during the
  final two weeks except for urgent corrections;
- add an in-product correction/report flow and a rapid data-takedown procedure;
- direct users to state/local election officials for authoritative voting
  procedures.[^eac]

### P1: production operations and observability

- Add external error reporting and alert delivery for API failures, latency,
  spend, quota denials, election-data freshness, and payment fulfillment.
- Add StoreKit and Stripe reconciliation views and alerts.
- Add queue/backlog visibility or explicitly remove queue expectations from the
  operating model.
- Load-test candidate lookup, ballot parsing, research streaming, account
  deletion, and payment fulfillment.
- Write and exercise provider-outage, data-correction, payment-reconciliation,
  security-incident, and election-night runbooks.
- Assign an on-call owner and escalation channel for the final six weeks.

### P1: App Store review package

Prepare:

- Privacy Nutrition Label matching account/email, address, political/value
  inputs, purchases, usage, diagnostics, and third-party AI processing;[^apple-privacy]
- screenshots, description, keywords, age rating, export-compliance answers,
  support URL, and review notes;
- a permanent review account with a representative ballot and available credit;
- explicit reviewer steps for consent, ballot import, AI analysis, purchase, and
  account deletion;
- visible “not an official election authority” language and links to official
  state/local sources;
- accessibility verification for VoiceOver, Dynamic Type, contrast, keyboard,
  and reduced-motion behavior.

## Delivery targets

### By July 17

- Merge and deploy the current draft PR.
- Complete Supabase SMTP/recovery verification.
- Complete Apple Developer enrollment and App Store Connect setup.
- Stand up staging from a clean database and complete the first restore drill.
- Begin the native Capacitor/StoreKit client.

### July 18–August 7: production web beta

- Finish monitoring, alerts, provider budgets, load testing, and runbooks.
- Complete the first national ballot-coverage and AI-quality evaluation.
- Recruit 25–50 testers across multiple states and political viewpoints.
- Freeze the public-beta feature set.

### August 8–28: native completion

- Complete native-value features and physical-device testing.
- Finish StoreKit sandbox and reconciliation tests.
- Complete privacy, accessibility, offline, poor-network, and expired-session
  testing.

### August 29–September 11: TestFlight

- Run internal and then external TestFlight testing.[^testflight]
- Close all P0/P1 defects.
- Finalize screenshots, review credentials, privacy label, and review notes.

### September 12: submit v1

Submit the app and in-app purchase products together with a live backend and
working review account.[^apple-review]

### September 26: target public launch

Use October for stabilization, source corrections, support, and election-data
freshness—not feature expansion.

## Definition of ready

Polis is ready only when:

- password reset succeeds through production email and invalid links fail
  safely;
- staging migration, rollback, and backup-restore drills succeed;
- native StoreKit purchase, duplicate, interruption, refund, and account tests
  pass;
- ballot coverage limitations are measured and presented honestly;
- the versioned AI quality benchmark meets its release thresholds;
- production alerts and operating runbooks have been exercised;
- TestFlight has no open P0/P1 defects;
- App Review receives a working demo account and complete instructions.

## Primary sources

[^apple-review]: Apple, [App Review Guidelines](https://developer.apple.com/app-store/review/guidelines/).
[^apple-enrollment]: Apple, [Apple Developer Program enrollment](https://developer.apple.com/help/account/membership/program-enrollment).
[^apple-privacy]: Apple, [Manage app privacy](https://developer.apple.com/help/app-store-connect/manage-app-information/manage-app-privacy) and [App privacy details](https://developer.apple.com/app-store/app-privacy-details/).
[^testflight]: Apple, [TestFlight overview](https://developer.apple.com/help/app-store-connect/test-a-beta-version/testflight-overview/).
[^capacitor]: Ionic, [Capacitor documentation](https://capacitorjs.com/docs).
[^google-civic]: Google, [Civic Information API voterInfoQuery](https://developers.google.com/civic-information/docs/v2/elections/voterInfoQuery).
[^eac]: U.S. Election Assistance Commission, [Voting 101: Election Information for New Voters](https://www.eac.gov/sites/default/files/2024-12/Voting_101_Flyer_Full_Page_508.pdf).
[^fec]: Federal Election Commission, [2026 congressional primary dates and candidate filing deadlines](https://www.fec.gov/resources/cms-content/documents/2026pdates.pdf).
