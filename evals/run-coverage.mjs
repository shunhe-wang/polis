#!/usr/bin/env node
// Ballot-coverage evidence harness.
//
// Drives GET /api/ballot/lookup for every representative address in
// evals/coverage/addresses.json, exactly as a guest user would, and records
// exact-ballot success, partial results, unavailable lookups, and whether
// official-source fallback links were offered.
//
// Usage:
//   node evals/run-coverage.mjs --base-url https://staging.getpolis.vote
//   node evals/run-coverage.mjs --base-url http://localhost:3000 --states CA,TX --limit 10
//
// The target deployment must have GOOGLE_CIVIC_API_KEY configured; the
// harness itself needs no credentials. Results are written to
// evals/coverage/results/ as JSON (full detail) and Markdown (summary matrix).

import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

function parseArgs(argv) {
  const args = {
    baseUrl: "http://localhost:3000",
    limit: Infinity,
    states: null,
    delayMs: 1100,
  };
  for (let i = 2; i < argv.length; i += 1) {
    const value = () => argv[++i];
    switch (argv[i]) {
      case "--base-url":
        args.baseUrl = value().replace(/\/$/, "");
        break;
      case "--limit":
        args.limit = Number.parseInt(value(), 10);
        break;
      case "--states":
        args.states = new Set(
          value()
            .split(",")
            .map((state) => state.trim().toUpperCase())
            .filter(Boolean)
        );
        break;
      case "--delay-ms":
        args.delayMs = Number.parseInt(value(), 10);
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        process.exit(2);
    }
  }
  return args;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function lookupAddress(baseUrl, address) {
  const url = `${baseUrl}/api/ballot/lookup?address=${encodeURIComponent(address)}`;
  const startedAt = Date.now();
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(30_000),
      headers: { Accept: "application/json" },
    });
    const body = await response.json().catch(() => null);
    return {
      httpStatus: response.status,
      durationMs: Date.now() - startedAt,
      status: body?.importMeta?.status ?? "error",
      confidence: body?.importMeta?.confidence ?? null,
      raceCount: Array.isArray(body?.races) ? body.races.length : 0,
      measureCount: Array.isArray(body?.measures) ? body.measures.length : 0,
      requiresElectionSelection: Boolean(body?.requiresElectionSelection),
      fallbackLinkCount: Array.isArray(body?.importMeta?.fallbackLinks)
        ? body.importMeta.fallbackLinks.length
        : 0,
      error: body?.error ?? (response.ok ? null : `HTTP ${response.status}`),
    };
  } catch (error) {
    return {
      httpStatus: null,
      durationMs: Date.now() - startedAt,
      status: "error",
      confidence: null,
      raceCount: 0,
      measureCount: 0,
      requiresElectionSelection: false,
      fallbackLinkCount: 0,
      error: error instanceof Error ? error.message : "Request failed",
    };
  }
}

function summarize(results) {
  const byStatus = {};
  for (const result of results) {
    byStatus[result.status] = (byStatus[result.status] ?? 0) + 1;
  }
  const total = results.length || 1;
  const rate = (count) => `${(((count ?? 0) / total) * 100).toFixed(1)}%`;
  return {
    total: results.length,
    complete: byStatus.complete ?? 0,
    partial: byStatus.partial ?? 0,
    unavailable: byStatus.unavailable ?? 0,
    errors: byStatus.error ?? 0,
    completeRate: rate(byStatus.complete),
    partialRate: rate(byStatus.partial),
    unavailableRate: rate(byStatus.unavailable),
    errorRate: rate(byStatus.error),
    fallbackOfferedWhenNotComplete: results.filter(
      (result) => result.status !== "complete" && result.fallbackLinkCount > 0
    ).length,
    notCompleteCount: results.filter((result) => result.status !== "complete")
      .length,
  };
}

function statusGlyph(status) {
  switch (status) {
    case "complete":
      return "✓";
    case "partial":
      return "◐";
    case "unavailable":
      return "✗";
    default:
      return "!";
  }
}

function buildMarkdown({ baseUrl, retrievedAt, results, summary }) {
  const lines = [];
  lines.push("# Ballot coverage matrix");
  lines.push("");
  lines.push(`Source: Google Civic via ${baseUrl}/api/ballot/lookup`);
  lines.push(`Retrieved: ${retrievedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Addresses tested: ${summary.total}`);
  lines.push(`- Complete ballots: ${summary.complete} (${summary.completeRate})`);
  lines.push(`- Partial ballots: ${summary.partial} (${summary.partialRate})`);
  lines.push(
    `- Unavailable: ${summary.unavailable} (${summary.unavailableRate})`
  );
  lines.push(`- Request errors: ${summary.errors} (${summary.errorRate})`);
  lines.push(
    `- Official-source fallback offered for ${summary.fallbackOfferedWhenNotComplete} of ${summary.notCompleteCount} non-complete lookups`
  );
  lines.push("");
  lines.push("Legend: ✓ complete, ◐ partial, ✗ unavailable, ! request error.");
  lines.push("");
  lines.push("## Matrix");
  lines.push("");
  lines.push("| State | Urban | Suburban | Rural |");
  lines.push("|---|---|---|---|");

  const byState = new Map();
  for (const result of results) {
    if (!byState.has(result.state)) byState.set(result.state, {});
    byState.get(result.state)[result.locale] = result;
  }
  for (const state of [...byState.keys()].sort()) {
    const row = byState.get(state);
    const cell = (locale) => {
      const result = row[locale];
      if (!result) return "—";
      return `${statusGlyph(result.status)} ${result.raceCount}r/${result.measureCount}m`;
    };
    lines.push(
      `| ${state} | ${cell("urban")} | ${cell("suburban")} | ${cell("rural")} |`
    );
  }

  lines.push("");
  lines.push("## Non-complete lookups");
  lines.push("");
  for (const result of results.filter((entry) => entry.status !== "complete")) {
    lines.push(
      `- ${result.state} ${result.locale} (${result.address}): ${result.status}${result.error ? ` - ${result.error}` : ""}`
    );
  }
  lines.push("");
  return lines.join("\n");
}

async function main() {
  const args = parseArgs(process.argv);
  const fixturePath = path.join(HERE, "coverage", "addresses.json");
  const fixture = JSON.parse(await readFile(fixturePath, "utf8"));
  let addresses = fixture.addresses;
  if (args.states) {
    addresses = addresses.filter((entry) => args.states.has(entry.state));
  }
  if (Number.isFinite(args.limit)) {
    addresses = addresses.slice(0, args.limit);
  }

  console.log(
    `Running ${addresses.length} lookups against ${args.baseUrl} (fixture ${fixture.version})`
  );

  const retrievedAt = new Date().toISOString();
  const results = [];
  for (const [index, entry] of addresses.entries()) {
    const lookup = await lookupAddress(args.baseUrl, entry.address);
    results.push({ ...entry, ...lookup, retrievedAt: new Date().toISOString() });
    console.log(
      `[${index + 1}/${addresses.length}] ${entry.state} ${entry.locale}: ${lookup.status} (${lookup.raceCount} races, ${lookup.measureCount} measures)`
    );
    if (index < addresses.length - 1) await sleep(args.delayMs);
  }

  const summary = summarize(results);
  const stamp = retrievedAt.slice(0, 10);
  const resultsDir = path.join(HERE, "coverage", "results");
  await mkdir(resultsDir, { recursive: true });

  const jsonPath = path.join(resultsDir, `coverage-${stamp}.json`);
  await writeFile(
    jsonPath,
    `${JSON.stringify(
      {
        fixtureVersion: fixture.version,
        baseUrl: args.baseUrl,
        retrievedAt,
        summary,
        results,
      },
      null,
      2
    )}\n`
  );

  const markdownPath = path.join(resultsDir, `coverage-${stamp}.md`);
  await writeFile(
    markdownPath,
    buildMarkdown({ baseUrl: args.baseUrl, retrievedAt, results, summary })
  );

  console.log(`\nSummary: ${JSON.stringify(summary, null, 2)}`);
  console.log(`Wrote ${jsonPath}`);
  console.log(`Wrote ${markdownPath}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
