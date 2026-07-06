# Ballot data source strategy

## Current decision

Keep Google Civic as a best-effort convenience lookup, not as a complete ballot
guarantee. Its current public documentation still exposes `electionQuery` and
`voterInfoQuery`, but availability is limited to supported elections and results can
omit local, precinct-specific, or not-yet-published contests.

The production fallback is the official sample-ballot workflow already in Polis:

1. link the voter to state/local official election sources;
2. accept an official PDF, image, or pasted ballot text;
3. turn it into an editable draft;
4. require the voter to review it before applying it;
5. retain source and confidence metadata.

This path should be the recommended option whenever a voter has their official sample
ballot. Manual entry remains the no-AI fallback.

## Licensed-provider evaluation

Evaluate Democracy Works Elections API and BallotReady commercially before replacing
Google Civic. Require a written answer and test dataset for:

- 2026 federal, state, county, municipal, judicial, and ballot-measure coverage;
- address-to-precinct and exact-ballot resolution;
- primary-party handling and late candidate changes;
- source provenance, update timestamps, corrections, and SLA;
- development/staging rights, caching, derived-data retention, and App Store use;
- pricing at projected lookup volume and support during the final six weeks.

Do not integrate a provider until a representative-address bake-off shows materially
better exact-ballot coverage than the current hybrid. A contract is a product decision,
not merely an API-key swap.
