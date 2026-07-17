# Polis release evidence harnesses

Two harnesses produce the coverage and AI-quality evidence the readiness plan requires before a public beta.
Both write dated reports into their `results/` directories; commit those reports as the release record.

## Ballot-coverage matrix

```
npm run eval:coverage -- --base-url https://<staging-or-production-host>
```

- Drives `GET /api/ballot/lookup` for the 151 representative addresses in [coverage/addresses.json](coverage/addresses.json) (urban, suburban, and rural for all 50 states, plus DC).
- The addresses are public civic buildings (city halls, county courthouses, libraries), so they exercise real precincts without involving any private individual.
- Records exact-ballot success, partial results, unavailable lookups, request errors, and whether official-source fallback links were offered, with source and retrieval time per row.
- Useful flags: `--states CA,TX` to subset, `--limit 10` for a smoke run, `--delay-ms 2000` to slow down for quota reasons.
- The target deployment needs `GOOGLE_CIVIC_API_KEY`; the harness itself needs no credentials.

Interpretation: Google Civic is best-effort, not a guaranteed exact-ballot feed.
The number that gates the beta is not the complete-ballot rate alone; it is complete-ballot rate plus fallback-offered rate, because official-upload recovery is the designed fallback path.
Re-run the matrix whenever the ballot-data source changes and during the Democracy Works bake-off described in [../docs/ballot-data-source-strategy.md](../docs/ballot-data-source-strategy.md).

## Golden AI-quality benchmark

```
npm run eval:golden
```

- Requires `ZAI_API_KEY` (read from the environment, `.env.local`, or `.env`).
- Runs the versioned cases in [golden/golden-set.json](golden/golden-set.json) against the live provider through the real `src/lib/zai.ts` pipeline, including the production sanitizers and validators.
- Categories: party attribution for well-known candidates, hallucination traps (fictional candidates must not get confident sourced dossiers), stale candidacies (announced retirements must not be listed), dossier quality for well-covered candidates, and paired opposing-profile runs for partisan-skew review.
- Thresholds live in the golden set file; the run fails if a category drops below its threshold.
- Paired-profile alignment scores are recorded, not asserted; review them by hand for skew.

Maintenance rules:

- Verify the ground-truth facts (especially stale candidacies) against official sources before trusting a failing case; politics changes faster than fixtures.
- Bump `version` in `golden-set.json` whenever cases or thresholds change.
- Freeze `ZAI_MODEL` and the prompts in `src/lib/zai.ts` during the final two weeks before election day except for urgent corrections, and run this benchmark before and after any change in that window.
