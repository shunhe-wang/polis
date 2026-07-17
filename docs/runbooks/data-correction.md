# Runbook: Correcting wrong election information in a published guide

## Purpose

Remove and correct wrong election content that Polis has shown to users: a wrong candidate party, a stale candidacy (dropped out or replaced), or a hallucinated claim in AI research output.
This runbook covers intake, triage, where the content actually lives, correction, verification, and the postmortem note.

## Severity classification

- SEV1: Wrong ballot-level facts that could change a vote, live within 14 days of election day (November 3, 2026). Examples: wrong party label, a candidate shown who is not on the ballot, a fabricated disqualifying claim about a candidate.
- SEV2: Same classes of error outside the 14 day window, or a materially misleading dossier claim with a bad source.
- SEV3: Cosmetic or low-impact errors: typos, awkward summaries, a stale but harmless detail.

## First five minutes

- [ ] Check the in-product intake first: users file reports from every candidate and measure card, and open reports appear in the Content Reports section of `/admin`.
- [ ] Query the queue directly when needed: `select id, category, subject_type, subject_name, race_name, details, status, created_at from content_reports where status in ('open', 'in_review') order by created_at;`
- [ ] Capture the report verbatim: the exact text shown, the candidate or measure name, race name, state, and roughly when the user generated the guide.
- [ ] Mark the report you are working: `update content_reports set status = 'in_review', updated_at = now() where id = '<id>';`
- [ ] Reproduce: run the same race through the product, or query the caches (SQL below) to see what is currently being served.
- [ ] Classify severity using the table above.
- [ ] For SEV1, proceed immediately to correction; do not wait for full root cause.

## Where content lives

All corrections happen in the Supabase SQL editor with owner access required, because these tables are only writable through the service role.

| Content | Table | Keyed by | TTL |
|---|---|---|---|
| Neutral AI dossier per candidate or measure | `research_dossiers` | `kind` + `cache_key`; also has readable `title` and `state` columns | 7 days |
| Personalized per-item AI result | `research_item_cache` | `kind` + `cache_key`; readable `title` column | 21 days |
| Full-guide AI result per user | `research_cache_entries` | `user_id` + `cache_key` | 12 hours |
| Starter (free) analyses | `starter_candidate_analyses` | user and hash columns | n/a |
| Saved guides users can reopen and share | `voter_guides` (`recommendations` jsonb, `is_public` flag) | `id`, `user_id` | permanent |
| Saved ballot per user | `saved_ballots` (`ballot_input` jsonb) | `user_id` | permanent |
| Imported ballot structure from Google Civic | `ballot_imports`, `ballot_import_contests`, `ballot_import_candidates` | import id | permanent |
| User-reviewed ballot drafts from uploads | `ballot_review_drafts` | user and draft id | permanent |

Cache keys are content-derived hashes built in `src/lib/research-dossiers.ts` (prefix `candidate_dossier_v1`, from state, race name, candidate name, party) and `src/lib/research-item-cache.ts` (prefixes `candidate_personalization_v1`, `measure_personalization_v1`).
You do not need to recompute hashes; filter on the `title` and `state` columns instead.

## Triage: find the source of the error

- [ ] Wrong party or wrong candidate list usually comes from ballot import: check `ballot_import_candidates` for the race, and compare with the official source.
  Party normalization lives in `src/lib/party-format.ts` and deterministic lookups in `src/lib/deterministic-candidate-lookup.ts`.
- [ ] A hallucinated claim, wrong stance, or stale candidacy narrative comes from AI research: check `research_dossiers` for the candidate.
- [ ] Confirm ground truth against an official source (state or county election office, FEC) before changing anything.

## Correction steps

### 1. Purge the poisoned AI caches

- [ ] Find the rows: `select kind, cache_key, title, state, updated_at from research_dossiers where title ilike '%<candidate name>%' and state = '<state>';`
- [ ] Delete the dossier rows: `delete from research_dossiers where cache_key in (...);`
- [ ] Delete downstream personalized results: `select kind, cache_key, title from research_item_cache where title ilike '%<candidate name>%';` then delete the matching rows.
- [ ] Delete full-guide caches that could replay the bad item: `delete from research_cache_entries where results::text ilike '%<candidate name>%';`
  This is coarse; the 12 hour TTL bounds the blast radius if you skip it for SEV3.
- [ ] For starter analyses: `delete from starter_candidate_analyses where ... ;` matching on the candidate columns present in that table.
- [ ] Note: `/api/admin/cleanup` only deletes expired rows via `cleanup_app_operational_data`; it cannot target specific content.
  TODO: no admin UI exists for targeted cache invalidation; SQL is the only path.

### 2. Fix ballot-structure errors

- [ ] If the error is in imported ballot data, correct or delete the affected `ballot_import_candidates` and `ballot_import_contests` rows.
- [ ] If the bad data keeps re-importing from Google Civic, the upstream feed is wrong; users should be steered to the official upload path (`/api/ballot/review-draft`) for that jurisdiction, and consider a `jurisdiction_fallbacks` row pointing at the official source.

### 3. Handle already-published guides

- [ ] Saved guides in `voter_guides` are snapshots; purging caches does not fix them.
- [ ] Find affected guides: `select id, user_id, is_public, created_at from voter_guides where recommendations::text ilike '%<candidate name>%';`
- [ ] For SEV1, set `is_public = false` on affected public guides immediately, then decide per guide whether to delete the row or leave the owner's private copy.
- [ ] There is no mechanism to notify affected users in code.
  TODO: user notification for corrected guides is manual (email from the owner account) until a notification path exists.

### 4. Regenerate

- [ ] Re-run research for the affected race through the product so fresh dossiers are created with corrected inputs.
- [ ] If the model repeats the hallucination, the fix is a prompt or source problem in `src/lib/zai.ts`; escalate to an engineering change and, inside the freeze window, follow the urgent-correction exception in `docs/runbooks/election-night.md`.

## Verification

- [ ] Re-run the exact user flow that produced the report and confirm the corrected content.
- [ ] Confirm the purged rows are gone and new `research_dossiers` rows carry a fresh `updated_at`.
- [ ] For a party or candidacy fix, verify the race in at least one other jurisdiction was not collaterally purged.
- [ ] Check `/admin` Recent Errors for any failures caused by the manual SQL.

## Close the report

- [ ] Resolve the intake row: `update content_reports set status = 'resolved', resolution_note = '<what changed>', resolved_at = now(), updated_at = now() where id = '<id>';`
- [ ] Use `status = 'dismissed'` with a note when the reported content was correct.

## Postmortem note

Write a short note in `docs/runbooks/postmortems/` covering:

- [ ] What was wrong, who reported it, and how long it was live.
- [ ] Source of the error: import feed, AI research, prompt, or normalization code.
- [ ] Which tables were touched and the exact SQL run.
- [ ] Whether affected users were identified and notified.
- [ ] One prevention item, filed as an issue (for example an eval case, a prompt rule, or a validation in `src/lib/ballot-draft-quality.ts`).
