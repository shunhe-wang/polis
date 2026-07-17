# Runbook: Provider outage or degradation

## Purpose

Restore or gracefully degrade Polis when an upstream provider fails: Z.AI (GLM 5.2), Google Civic, Supabase, or Vercel.
This runbook covers detection, immediate mitigation using paths that exist in code, user communication, and recovery verification.

## Severity classification

- SEV1: Supabase or Vercel is down, or all AI research requests fail. The product is unusable or users cannot sign in.
- SEV2: Z.AI error rate is elevated but some requests succeed, or Google Civic returns no ballots for known-good addresses.
- SEV3: Elevated latency, intermittent errors, or a degraded election-data freshness probe with no user reports.

## First five minutes

- [ ] Open the admin dashboard at `/admin` (requires an email listed in `ADMIN_EMAILS`).
- [ ] Check `providerErrors24h`, `averageProviderLatencyMs`, `electionDataStatus`, and the Recent Errors list.
- [ ] When `ALERT_WEBHOOK_URL` is configured, error-severity events are pushed to the alert webhook automatically (`src/lib/alerts.ts`); the dashboard remains the detail view.
- [ ] Query recent events directly in the Supabase SQL editor (owner access required): `select * from app_event_logs where severity = 'error' order by created_at desc limit 50;`.
- [ ] Check provider status pages: Vercel status, Supabase status, Stripe status, and the Z.AI console (owner access required for account-level views).
- [ ] Reproduce as a user: run a starter analysis on the production site and note the exact error message.
- [ ] Declare severity and note the start time for the postmortem.

## Z.AI (GLM 5.2) outage or degradation

Client code lives in `src/lib/zai.ts`.
Every call records `zai_request_failed` or `zai_request_succeeded` events (category `provider`) to `app_event_logs` via `src/lib/observability.ts`.

### Detection

- [ ] `/admin` shows rising `providerErrors24h` and `zai_request_failed` entries in Recent Errors.
- [ ] Confirm scope in SQL: `select event, count(*) from app_event_logs where category = 'provider' and created_at > now() - interval '1 hour' group by event;`.
- [ ] Distinguish full outage (all calls fail) from degradation (elevated `durationMs`, partial failures, or 429s).

### Immediate mitigation

- [ ] Cached content keeps serving without Z.AI: `research_dossiers` (7 day TTL), `research_item_cache` (21 day TTL), and `research_cache_entries` (12 hour TTL) are read before any provider call.
- [ ] Saved guides in `voter_guides` are unaffected.
- [ ] To throttle load onto a degraded provider, lower the quota env vars in Vercel (owner access required): `RESEARCH_REQUESTS_PER_10M`, `RESEARCH_ITEMS_PER_DAY`, `PREFETCH_ITEMS_PER_10M`, `PREFETCH_ITEMS_PER_DAY`, `CANDIDATE_LOOKUPS_PER_10M`, `CANDIDATE_LOOKUPS_PER_DAY`, then redeploy.
- [ ] Hard kill switch: unset `ZAI_API_KEY` in Vercel and redeploy.
  This makes `isZaiConfigured()` in `src/lib/zai.ts` return false, and the AI routes return an error instead of calling the provider: `/api/research`, `/api/research/prefetch`, `/api/candidates`, `/api/starter-analysis`, `/api/ballot/review-draft`.
  Note: these routes currently return HTTP 500 with "Z.AI API key is not configured", which is a raw error, not a friendly maintenance message.
  TODO: no graceful AI maintenance mode exists in code; the kill switch is the 500 response.
- [ ] If Z.AI announces a regional or endpoint issue, `ZAI_BASE_URL` can point at an alternate Z.AI endpoint (owner access required to Vercel env vars).
- [ ] Do not switch `ZAI_MODEL` during an incident unless Z.AI confirms the configured model is the problem; see the freeze policy in `docs/runbooks/election-night.md`.

### User communication

- [ ] There is no in-app banner or status page in the codebase.
  TODO: a maintenance banner and public status page are not built; communicate through the App Store listing notes and any owned social channels for now.
- [ ] If credits were consumed for failed research, follow `docs/runbooks/payment-reconciliation.md` to restore them.

### Recovery verification

- [ ] Restore `ZAI_API_KEY` and any changed quota values, then redeploy.
- [ ] Run one starter analysis and one full guide end to end in production.
- [ ] Confirm new `zai_request_succeeded` events appear and `providerErrors24h` stops climbing on `/admin`.

## Google Civic outage

Client code lives in `src/lib/ballot-sources/google-civic.ts` and requires `GOOGLE_CIVIC_API_KEY`.
Ballot lookup at `/api/ballot/lookup` already degrades gracefully: when Civic returns nothing, the response carries `importMeta.status = "unavailable"` plus fallback links from `src/lib/ballot-fallbacks.ts` and `src/lib/official-fallbacks.ts` (backed by the `jurisdiction_fallbacks` table).

### Detection

- [ ] The daily freshness probe `/api/cron/election-data-freshness` (scheduled in `vercel.json` at 12:00 UTC, authenticated with `CRON_SECRET`, probing `ELECTION_FRESHNESS_PROBE_ADDRESS`) writes `election_data_probe_succeeded`, `election_data_probe_degraded`, or `election_data_probe_failed` events.
- [ ] `/admin` surfaces this as `electionDataStatus`: healthy, degraded, stale (no probe in 30 hours), or unconfigured.
- [ ] Check Google Cloud console quotas and API status for the Civic Information API (owner access required).

### Immediate mitigation

- [ ] No action is required to keep the product usable: the official sample-ballot upload and paste path at `/api/ballot/review-draft` is the designed fallback and does not use Google Civic.
- [ ] If Civic is returning corrupt data rather than failing, unset `GOOGLE_CIVIC_API_KEY` in Vercel and redeploy so lookups fail into the fallback-link path instead of importing bad ballots (owner access required).
- [ ] Trigger an out-of-band probe to confirm state: `curl -H "Authorization: Bearer $CRON_SECRET" https://<production-host>/api/cron/election-data-freshness`.

### Recovery verification

- [ ] Run the probe again and confirm an `election_data_probe_succeeded` event.
- [ ] Run a real address lookup through the UI and confirm `importMeta.status` is `complete` or `partial`.

## Supabase outage

Supabase provides auth, all Postgres tables, and RLS.
There is no code-level mitigation; every authenticated route depends on it.

- [ ] Confirm at the Supabase status page and the project dashboard (owner access required).
- [ ] Note that `recordAppEvent` falls back to stderr logging when the admin client is unavailable, so check Vercel runtime logs during the outage (owner access required).
- [ ] Do not restart or redeploy repeatedly; wait for the provider.
- [ ] After recovery, verify sign-in, a saved-guide load from `voter_guides`, and one Stripe checkout webhook delivery (Stripe retries failed webhooks automatically; check the Stripe dashboard, owner access required).
- [ ] Check `unfulfilledOrders` and `unfulfilledAppStoreTransactions` on `/admin` for payments that landed during the outage, then follow `docs/runbooks/payment-reconciliation.md`.

## Vercel incident

- [ ] Confirm at the Vercel status page and the project's deployment dashboard (owner access required).
- [ ] If a bad deploy coincides with the incident, use Vercel instant rollback to the previous production deployment (owner access required).
- [ ] Remember the cron probe runs on Vercel; a Vercel incident can produce misleading `stale` election-data status afterward.
- [ ] After recovery, load the homepage, sign in, and run one starter analysis.

## Postmortem

- [ ] Record timeline, detection lag, user impact, and credits owed in a postmortem note under `docs/runbooks/postmortems/` (create the directory on first use).
- [ ] File issues for any TODO in this runbook that made the incident harder to handle.
