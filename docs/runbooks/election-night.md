# Runbook: Election night and the final two weeks

## Purpose

Keep Polis stable, accurate, and responsive from October 20, 2026 through election day, November 3, 2026, when traffic peaks and the cost of a wrong answer is highest.
This runbook defines the freeze policy, monitoring cadence, on-call expectations, escalation, and the known load-sensitive endpoints.

## Severity classification

During the freeze window, bump normal severities up one level.

- SEV1: Site down, sign-in broken, AI research fully failing, payments failing, or a SEV1 data error per `docs/runbooks/data-correction.md`.
- SEV2: Degraded research quality or latency, ballot lookups failing for a state, quota misfires locking out legitimate users.
- SEV3: Anything cosmetic; defer fixes until after November 4.

## First five minutes (any election-window incident)

- [ ] Open `/admin` and screenshot it; the counters are your baseline evidence.
- [ ] Identify which runbook applies and switch to it: `provider-outage.md`, `data-correction.md`, `payment-reconciliation.md`, or `security-incident.md`.
- [ ] Check Vercel, Supabase, and Stripe status pages before assuming the bug is ours.
- [ ] During the freeze, prefer configuration mitigations (env vars, quota tuning, Vercel rollback) over shipping new code.
- [ ] Log the start time; election-window postmortems are mandatory for SEV1 and SEV2.

## Freeze policy (October 20 through November 3, 2026)

Model and prompt versions are frozen for the final two weeks, except urgent corrections.

- [ ] Pin `ZAI_MODEL` explicitly in Vercel env vars before October 20; do not rely on the code default in `src/lib/zai.ts` (`glm-5.2`) in case a deploy changes it.
- [ ] No edits to the prompts in `src/lib/zai.ts` (`SYSTEM_PROMPT`, dossier prompts, personalization prompts, ballot-parse prompts).
- [ ] No changes to cache-key versions (`candidate_dossier_v1`, `measure_dossier_v1` in `src/lib/research-dossiers.ts`; `candidate_personalization_v1`, `measure_personalization_v1` in `src/lib/research-item-cache.ts`); bumping them invalidates every cache at peak load.
- [ ] No schema migrations in `supabase/migrations/` unless required by an urgent correction.
- [ ] Dependency upgrades, refactors, and feature work wait until after election day.
- [ ] Allowed during freeze: env-var quota tuning, Vercel rollbacks, content corrections per `data-correction.md`, and security fixes per `security-incident.md`.

### Urgent-correction exception

- [ ] Only for wrong election information, security fixes, or payment integrity.
- [ ] Smallest possible diff, reviewed against the frozen behavior, verified on a preview deployment before promotion.
- [ ] If a prompt must change to stop a repeating hallucination, that qualifies; note it in the postmortem and re-verify one known-good race afterward.

## Pre-freeze checklist (complete by October 19)

- [ ] Confirm `ZAI_MODEL`, all quota env vars, and `ELECTION_FRESHNESS_PROBE_ADDRESS` are set to intended production values in Vercel (owner access required).
- [ ] Raise the freshness-probe cadence: edit the cron schedule in `vercel.json` from `0 12 * * *` to hourly for the final week, and deploy before the freeze starts.
- [ ] Verify the daily probe has been green for a week: `electionDataStatus` healthy on `/admin`.
- [ ] Run `/api/admin/cleanup` once so expired cache rows do not bloat tables going into peak load.
- [ ] Verify Stripe webhook and StoreKit fulfillment end to end in production per `payment-reconciliation.md`.
- [ ] Confirm Supabase database backups and point-in-time recovery are enabled (owner access required).
- [ ] Pre-warm dossiers for the highest-traffic statewide races by running research on representative ballots; `research_dossiers` TTL is 7 days, so do this inside the final week for it to carry to election day.
- [ ] Set `ALERT_WEBHOOK_URL` (and consider `ALERT_MIN_SEVERITY=warning` for the election window) so error events page the on-call automatically; the cadence below is the backstop.

## Monitoring cadence

All checks happen on the admin dashboard at `/admin` unless noted.

- October 20 to 27: check twice daily (morning and evening).
- October 28 to November 2: check every 4 waking hours.
- November 3 (election day): check hourly from 06:00 local through 22:00, then at close of counting coverage.

Each check:

- [ ] `providerErrors24h`, `averageProviderLatencyMs`, and `estimatedProviderCostUsd24h` against yesterday's values.
- [ ] `electionDataStatus` is healthy and `latestElectionDataProbeAt` is recent.
- [ ] `unfulfilledOrders` and `unfulfilledAppStoreTransactions` are zero.
- [ ] `recordedQuotaDenials24h`: a spike means legitimate users are being throttled; consider raising `RESEARCH_REQUESTS_PER_10M` and `CANDIDATE_LOOKUPS_PER_10M` in Vercel.
- [ ] Recent Errors list is empty or explained.
- [ ] Once daily: run one real starter analysis as a user and eyeball the output quality.

## On-call expectations

- [ ] Polis is operated by a single owner; on-call is that owner from October 20 through November 4.
- [ ] Have owner access at hand and tested before the window: Vercel, Supabase, Stripe, App Store Connect, Google Cloud console, Z.AI console, and the domain registrar.
- [ ] Keep a logged-in `/admin` session and the Supabase SQL editor bookmarked.
- [ ] Response targets: acknowledge SEV1 within 15 minutes during waking hours, SEV2 within 2 hours, SEV3 next day.
- [ ] Election day: no other commitments; be at a real computer, not just a phone, from 06:00 through the evening.

## Escalation

- [ ] Vercel platform incident: Vercel support and status page (owner access required); mitigation is instant rollback or waiting.
- [ ] Supabase incident: Supabase support ticket with project ref (owner access required); there is no app-level workaround.
- [ ] Stripe: Stripe support chat (owner access required); payments failing does not block guide viewing for already-entitled users.
- [ ] Z.AI: support through the Z.AI console (owner access required); cached dossiers keep serving in the meantime, see `provider-outage.md`.
- [ ] Wrong election data reported by a user or campaign: treat as SEV1 and execute `data-correction.md` immediately; do not wait for verification of intent.
- [ ] Legal or press contact about election information: do not improvise; capture the inquiry and consult counsel before responding.

## Known load-sensitive endpoints

Ranked by expected cost per request.

- `/api/research` (`src/app/api/research/route.ts`): the full-guide pipeline, multiple Z.AI calls per ballot, gated by `consume_guide_access` and quotas; the most expensive route in the system.
- `/api/research/prefetch` (`maxDuration = 60`): background dossier warming; if load spikes, lower `PREFETCH_ITEMS_PER_10M` and `PREFETCH_ITEMS_PER_DAY` first, since users do not see it fail.
- `/api/starter-analysis`: the free funnel entry, IP-limited by `STARTER_ANALYSES_PER_IP_DAY` and `FREE_STARTER_ANALYSES`; the likeliest abuse target on election day.
- `/api/ballot/review-draft`: OCR (`glm-ocr`) plus parsing on uploads; limited by `BALLOT_PARSE_REQUESTS_PER_10M` and `BALLOT_PARSE_REQUESTS_PER_DAY`.
- `/api/candidates`: deterministic lookup first, then paid Z.AI web-search fallback; limited by `CANDIDATE_LOOKUPS_PER_10M` and `CANDIDATE_LOOKUPS_PER_DAY`.
- `/api/ballot/lookup`: Google Civic quota exposure; watch the Google Cloud console quota page (owner access required).
- `/api/stripe/webhook` and `/api/storekit/transactions`: not load-heavy but revenue-critical; any error spike here is SEV1.

## Load-shedding order

When cost or error rates climb, shed in this order, all via Vercel env vars plus redeploy (owner access required):

1. Lower `PREFETCH_ITEMS_PER_10M` and `PREFETCH_ITEMS_PER_DAY` (invisible to users).
2. Lower `MAX_RESEARCH_ITEMS_PER_REQUEST` (smaller guides, still functional).
3. Lower `CANDIDATE_LOOKUPS_PER_10M` and `STARTER_ANALYSES_PER_IP_DAY` (throttles free traffic).
4. Lower `RESEARCH_REQUESTS_PER_10M` (throttles paying users; last resort).
5. Unset `ZAI_API_KEY` (full AI stop; see `provider-outage.md` for the user-facing 500 behavior).

## After election day

- [ ] Keep the freeze through November 5 while provisional counts drive residual traffic.
- [ ] Restore the daily cron schedule in `vercel.json`.
- [ ] Run `/api/admin/cleanup`.
- [ ] Write the election-window retro in `docs/runbooks/postmortems/`, including every TODO in these runbooks that hurt, and file the fixes.
