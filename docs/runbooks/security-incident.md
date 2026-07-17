# Runbook: Security incident

## Purpose

Contain and recover from a credential leak, a discovered RLS bypass, or abnormal API spend.
Polis stores politically sensitive user data (values profiles, political identity, guide recommendations), so treat data-exposure incidents as high severity by default.

## Severity classification

- SEV1: `SUPABASE_SERVICE_ROLE_KEY` or `STRIPE_SECRET_KEY` exposed, an exploitable RLS bypass on user data, or evidence of active abuse.
- SEV2: A scoped provider key leaked (`ZAI_API_KEY`, `GOOGLE_CIVIC_API_KEY`, `GEOAPIFY_API_KEY`, `CRON_SECRET`, `STRIPE_WEBHOOK_SECRET`), or abnormal spend without confirmed data exposure.
- SEV3: A hardening gap found proactively with no evidence of exploitation.

## First five minutes

- [ ] Identify what leaked or what is bypassable, and since when (git history, Vercel deploy history, provider dashboards).
- [ ] For a leaked secret, rotate first and investigate second; rotation is cheap.
- [ ] For suspected active abuse of AI spend, apply the kill switch: unset `ZAI_API_KEY` in Vercel and redeploy (owner access required); see `docs/runbooks/provider-outage.md` for the user-facing effect.
- [ ] Preserve evidence: export relevant `app_event_logs` rows now, because `cleanup_app_operational_data` deletes logs older than 30 days.
- [ ] Start an incident timeline note with timestamps.

## Containment: secret rotation inventory

All server secrets live in Vercel project environment variables (owner access required); a redeploy is required after every change.
The authoritative list mirrors `.env.example`.

| Secret | Sensitivity | Rotate at | Notes |
|---|---|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Critical, bypasses RLS entirely | Supabase dashboard, API settings (owner access required) | Used by `src/lib/supabase/admin.ts` consumers: webhooks, observability, admin dashboard |
| `STRIPE_SECRET_KEY` | Critical, money movement | Stripe dashboard, API keys, roll key (owner access required) | |
| `STRIPE_WEBHOOK_SECRET` | High, forged fulfillment events | Stripe dashboard, webhook endpoint, roll secret (owner access required) | Verified in `src/app/api/stripe/webhook/route.ts` |
| `ZAI_API_KEY` | High, direct spend | Z.AI console (owner access required) | Kill switch when unset |
| `GOOGLE_CIVIC_API_KEY` | Medium, quota abuse | Google Cloud console, credentials (owner access required) | Restrict key to the Civic Information API |
| `GEOAPIFY_API_KEY` | Medium, quota abuse | Geoapify dashboard (owner access required) | Address autocomplete only |
| `CRON_SECRET` | Medium | Generate a new random value in Vercel | Gates `/api/cron/election-data-freshness` |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public by design | Rotate only if Supabase advises; RLS is the real boundary | Shipped to browsers and the iOS bundle |
| `ADMIN_EMAILS`, `PRO_EMAILS` | Config, not secret | Review for unauthorized additions | `ADMIN_EMAILS` gates `/admin` and `/api/admin/cleanup` via `src/lib/admin.ts` |
| `APPLE_BUNDLE_ID`, `APPLE_APP_ID`, `APPLE_IAP_ENVIRONMENT`, `APP_STORE_PRODUCT_ELECTION_PASS`, `APPLE_ROOT_CA_CERTS_BASE64`, `MOBILE_APP_ORIGIN` | Config, not secret | n/a | Verify values were not tampered with |

Additional containment:

- [ ] If the service role key leaked, also review Supabase auth users for accounts you do not recognize as admins, and check `ADMIN_EMAILS` in Vercel for tampering.
- [ ] If Vercel or Supabase account credentials themselves are suspect, rotate account passwords and confirm 2FA (owner access required); this is account security, not app config.
- [ ] If the leak was committed to git, rewrite is optional but rotation is mandatory; treat the secret as permanently burned.

## RLS bypass discovered

- [ ] Reproduce the bypass with an anon-key client before and after the fix.
- [ ] Review the RLS posture: migration 017 revoked client writes on `account_entitlements` and `ai_usage_counters`; user-owned tables (`values_profiles`, `voter_guides`, `saved_ballots`, `research_cache_entries`, `starter_candidate_analyses`, `billing_orders`, `guide_access_grants`, `app_store_transactions`, `ai_data_consents`, `ballot_review_drafts`) rely on `auth.uid()` policies defined in `supabase/migrations/`.
- [ ] Ship the fix as a new migration; apply it in the Supabase SQL editor immediately if the window is being exploited (owner access required), then commit the same SQL as a migration file.
- [ ] Remember `voter_guides` has an intentional public read policy for rows with `is_public = true`; confirm the bypass is not just that policy working as designed.
- [ ] Security-definer functions are part of the attack surface: `grant_billing_entitlement`, `fulfill_billing_checkout`, `consume_guide_access`, `fulfill_app_store_transaction`, `enforce_ai_quota`, `cleanup_app_operational_data`; verify their grants (`service_role` or `authenticated`) match the migrations.

## Abnormal API spend

- [ ] Read `/admin`: `estimatedProviderCostUsd24h`, `providerTokens24h`, `providerCalls24h`, and `recordedQuotaDenials24h`.
  Error-severity events are pushed to the webhook in `ALERT_WEBHOOK_URL` when configured (`src/lib/alerts.ts`); check `/admin` for detail.
- [ ] Attribute the spend: `select route, count(*) from app_event_logs where category = 'provider' and created_at > now() - interval '24 hours' group by route;` and check `user_id` concentration.
- [ ] Tighten quotas in Vercel env vars without a code change: `RESEARCH_REQUESTS_PER_10M`, `RESEARCH_ITEMS_PER_DAY`, `CANDIDATE_LOOKUPS_PER_10M`, `CANDIDATE_LOOKUPS_PER_DAY`, `PREFETCH_ITEMS_PER_10M`, `PREFETCH_ITEMS_PER_DAY`, `STARTER_ANALYSES_PER_IP_DAY`, `MAX_RESEARCH_ITEMS_PER_REQUEST` (enforced via `src/lib/ai-quotas.ts`).
- [ ] Confirm abuse gates are on: `REQUIRE_VERIFIED_EMAIL=true` and `BLOCK_DISPOSABLE_EMAILS=true` (enforced by `src/lib/account-trust.ts`).
- [ ] Full stop if needed: unset `ZAI_API_KEY` and redeploy.
- [ ] Compare app-side cost estimates with the Z.AI console billing page (owner access required); if the provider shows spend the app did not log, the key is leaked; rotate it.

## Assessment

- [ ] Determine what data was reachable: with the service role key, everything; with an RLS gap, only the affected tables for the affected rows.
- [ ] Establish the exposure window from deploy history and log timestamps.
- [ ] Identify affected users by id and email from the reachable tables.
- [ ] Classify the data: values profiles and political identity are sensitive personal data; `ai_data_consents` records what users agreed to share with the AI provider.

## Notification obligations

- [ ] If personal data was exposed, US state breach-notification laws likely apply, and timelines vary by state; consult counsel before drafting notices.
  This runbook is an operational checklist, not legal advice.
- [ ] Notify Stripe if card-flow secrets were involved (owner access required).
- [ ] Notify Supabase support for platform-level compromise (owner access required).
- [ ] Apple may need to be informed if the iOS app's users are affected in a way that touches App Store data commitments (owner access required, App Store Connect).
- [ ] Keep the user-notification draft factual: what, when, what we did, what the user should do.

## Recovery verification

- [ ] All rotated keys work: run a starter analysis (Z.AI), an address lookup (Civic and Geoapify), a checkout in test mode (Stripe), and the cron probe with the new `CRON_SECRET`.
- [ ] The old keys are dead: a request with the burned key fails at the provider.
- [ ] The RLS fix holds: the anon-client reproduction now fails.
- [ ] `/admin` error and spend counters return to baseline over 24 hours.
- [ ] Write the postmortem in `docs/runbooks/postmortems/` with the evidence export attached.
