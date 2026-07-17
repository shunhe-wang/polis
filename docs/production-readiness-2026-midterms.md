# Polis production and App Store readiness plan

**Last updated:** July 17, 2026
**Election day:** November 3, 2026[^fec]  
**Runway:** 109 days

This document lists outstanding work only. Once an item is implemented and
verified, remove it rather than retaining a completion history.

## Current critical path

1. Merge and deploy [PR #2](https://github.com/shunhe-wang/polis/pull/2).
2. Finish production account-email configuration and prove password recovery
   through a real inbox.
3. Establish isolated staging and production environments, then exercise
   migrations, rollback, and backup restoration.
4. Compile and device-test the native iOS client, then complete StoreKit sandbox
   fulfillment from an actual device or TestFlight build.
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
- Configure the App Store Server Notifications V2 URL
  (`/api/storekit/notifications`) so refunds and revocations claw back credits
  automatically.
- Provide tax, banking, agreements, and required business information.
- Decide the support URL and public marketing/company website used during
  review (all other submission materials are drafted in
  `docs/app-store-review-package.md`).
- Replace the stock Capacitor app icon with Polis branding.

### Alerting and evidence runs

- Set `ALERT_WEBHOOK_URL` (Slack-compatible) in staging and production so
  error events page the on-call; runbooks in `docs/runbooks/` assume it.
- Run `npm run eval:coverage -- --base-url <staging>` for the 50-state
  ballot-coverage matrix and commit the dated report from
  `evals/coverage/results/`.
- Re-run `npm run eval:golden` against the production model configuration and
  commit the dated report from `evals/golden/results/`; verify the
  stale-candidacy ground truths in `evals/golden/golden-set.json` first.

### Commercial ballot-data decision

- Request coverage samples, licensing terms, SLA, caching/retention rights, and
  pricing from Democracy Works and at least one comparable provider.
- Do not sign or integrate a feed until a representative-address bake-off shows
  materially better exact-ballot coverage than the current official-upload
  fallback.

Evaluation criteria are in `docs/ballot-data-source-strategy.md`.

## Engineering work still open

### P0: native iOS completion and StoreKit device verification

Install/select full Xcode, compile the generated Capacitor project, set the
final bundle identifier and signing team, and exercise it on a physical device.
The remaining native-value work is:[^apple-review][^capacitor]

Required v1 native value:

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

The evidence tooling now exists in `evals/` (see `evals/README.md`): a
151-address 50-state matrix harness (`npm run eval:coverage`), a versioned
golden set with thresholds for hallucination, wrong-party attribution, stale
candidacies, and partisan-skew review (`npm run eval:golden`), an in-product
correction/report flow (`content_reports` plus the `/admin` queue), and the
data-takedown procedure in `docs/runbooks/data-correction.md`.

Still required before public beta:

- run the coverage matrix against staging and commit the report, recording
  exact-ballot, partial, missing-contest, and official-upload recovery rates;
- verify the golden-set ground truths, run the benchmark on the production
  model configuration, and commit the report;
- freeze model/prompt versions during the final two weeks except for urgent
  corrections;
- direct users to state/local election officials for authoritative voting
  procedures.[^eac]

### P1: production operations and observability

Runbooks (`docs/runbooks/`), webhook alert delivery on error events
(`ALERT_WEBHOOK_URL`), StoreKit/Stripe reconciliation counters, and
refund/revocation handling (Stripe `charge.refunded`, App Store Server
Notifications) are implemented. Still open:

- Exercise each runbook once against staging (game-day drill), including a
  practice cache purge and a sandbox refund clawback.
- Load-test candidate lookup, ballot parsing, research streaming, account
  deletion, and payment fulfillment.
- Assign an on-call owner and escalation channel for the final six weeks.

### P1: App Store review package

The submission package is drafted in `docs/app-store-review-package.md`
(privacy label mapping, description, keywords, age rating, export compliance,
reviewer steps, demo-account spec, and guideline risk
assessment).[^apple-privacy] Still open:

- capture screenshots from real devices once the native client is complete;
- create the permanent review account with a representative ballot and
  available credit;
- close the gaps the package flags in the bundled iOS client: consent,
  ballot/guide experience, in-app disclaimer surface, and in-app account
  deletion UI (the API now supports mobile deletion), which drive guideline
  4.2/5.1.1(v) risk;
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
