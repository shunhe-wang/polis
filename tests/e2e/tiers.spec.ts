import { expect, test, type Page } from "@playwright/test";

const valuesProfile = {
  issueRatings: {
    economy: 4,
    healthcare: 4,
    climate: 5,
    immigration: 2,
    housing: 5,
    civil_liberties: 4,
    foreign_policy: 2,
    education: 3,
    crypto_tech: 2,
  },
  policySignals: {
    taxes_and_spending: "more_public_investment",
    immigration_approach: "balanced_border_and_legal_pathways",
    housing_growth: "build_more_housing_even_with_zoning_change",
    social_rights: "stronger_protection_for_lgbtq_and_reproductive_rights",
    energy_and_climate: "aggressive_clean_energy_and_emissions_cuts",
  },
  freeText: "Housing, rights, and climate matter most.",
  politicalIdentity: "progressive",
} as const;

const ballotInput = {
  address: "123 Main St",
  state: "VA",
  election: {
    id: "election-1",
    name: "Virginia Democratic Primary",
    electionDay: "2026-06-10",
    kind: "primary",
    selectedParty: "Democrat",
  },
  races: [
    {
      id: "race-1",
      name: "Mayor",
      level: "local",
      candidates: [
        { id: "cand-1", name: "Jane Doe", party: "Independent" },
        { id: "cand-2", name: "John Roe", party: "Democrat" },
      ],
    },
  ],
  measures: [
    {
      id: "measure-1",
      title: "Amendment 1",
      description: "Authorizes transit funding.",
      type: "amendment",
    },
  ],
} as const;

const starterResult = {
  candidateId: "cand-1",
  name: "Jane Doe",
  party: "Independent",
  race: "Mayor",
  alignmentScore: 78,
  issueBreakdown: [
    {
      issue: "economy",
      score: 72,
      summary: "Backs local business incentives.",
      candidatePosition: "Supports targeted tax credits for small businesses.",
      userPriority: 4,
    },
    {
      issue: "healthcare",
      score: 55,
      summary: "Healthcare is not a major part of the race.",
      candidatePosition: "Limited public position.",
      userPriority: 4,
    },
    {
      issue: "climate",
      score: 86,
      summary: "Supports cleaner transit and emissions cuts.",
      candidatePosition: "Backs electrified buses and building efficiency upgrades.",
      userPriority: 5,
    },
    {
      issue: "immigration",
      score: 50,
      summary: "Local race with little immigration policy authority.",
      candidatePosition: "No meaningful position found.",
      userPriority: 2,
    },
    {
      issue: "housing",
      score: 90,
      summary: "Strongly backs more housing supply.",
      candidatePosition: "Supports zoning reform and denser housing near transit.",
      userPriority: 5,
    },
    {
      issue: "civil_liberties",
      score: 75,
      summary: "Supports anti-discrimination protections.",
      candidatePosition: "Backs local LGBTQ protections.",
      userPriority: 4,
    },
    {
      issue: "foreign_policy",
      score: 50,
      summary: "Not relevant to the office.",
      candidatePosition: "No meaningful position found.",
      userPriority: 2,
    },
    {
      issue: "education",
      score: 62,
      summary: "Supports city-school coordination.",
      candidatePosition: "Backs after-school and youth programming partnerships.",
      userPriority: 3,
    },
    {
      issue: "crypto_tech",
      score: 48,
      summary: "Limited tech policy detail.",
      candidatePosition: "No meaningful position found.",
      userPriority: 2,
    },
  ],
  likes: [
    {
      text: "Supports faster housing approvals near transit.",
      sourceUrl: "https://example.com/housing",
      sourceTitle: "Housing Plan",
    },
    {
      text: "Backs stronger local LGBTQ protections.",
      sourceUrl: "https://example.com/rights",
      sourceTitle: "Rights Interview",
    },
  ],
  concerns: [
    {
      text: "Fiscal details on new spending remain thin.",
      sourceUrl: "https://example.com/budget",
      sourceTitle: "Budget Interview",
    },
    {
      text: "Public safety platform is still vague.",
      sourceUrl: "https://example.com/public-safety",
      sourceTitle: "Debate Recap",
    },
  ],
  confidence: "medium",
  reasoning:
    "Jane Doe lines up best on housing, climate, and civil-rights issues. The main tradeoff is that some implementation details are still vague.",
} as const;

const measureResult = {
  measureId: "measure-1",
  title: "Amendment 1",
  summary: "This measure would authorize a new local funding stream for transit improvements.",
  alignmentScore: 81,
  prosForVoter: [
    {
      text: "Supporters say it would expand cleaner transit options.",
      sourceUrl: "https://example.com/transit-yes",
      sourceTitle: "Transit Coalition",
    },
  ],
  consForVoter: [
    {
      text: "Opponents argue the funding oversight is still too loose.",
      sourceUrl: "https://example.com/transit-no",
      sourceTitle: "Fiscal Watchdog",
    },
  ],
  recommendation: "yes",
  confidence: "medium",
  reasoning:
    "The measure broadly aligns with pro-transit and climate goals, though oversight details are a reasonable concern.",
} as const;

function accountSummary(tier: "guest" | "free" | "pro") {
  if (tier === "guest") {
    return {
      tier: "guest",
      isAuthenticated: false,
      trustedAccount: false,
      emailVerified: false,
      trustReason: null,
      planKey: "guest",
      planLabel: "Guest",
      starterAnalysesRemaining: 0,
      electionPassCredits: 0,
      powerPassRunsRemaining: 0,
      powerPassExpiresAt: null,
      checkoutConfigured: true,
    };
  }

  if (tier === "free") {
    return {
      tier: "free",
      isAuthenticated: true,
      trustedAccount: true,
      emailVerified: true,
      trustReason: null,
      planKey: "free",
      planLabel: "Free",
      starterAnalysesRemaining: 1,
      electionPassCredits: 0,
      powerPassRunsRemaining: 0,
      powerPassExpiresAt: null,
      checkoutConfigured: true,
    };
  }

  return {
    tier: "pro",
    isAuthenticated: true,
    trustedAccount: true,
    emailVerified: true,
    trustReason: null,
    planKey: "power_14d",
    planLabel: "Power Pass",
    starterAnalysesRemaining: 1,
    electionPassCredits: 0,
    powerPassRunsRemaining: 8,
    powerPassExpiresAt: "2099-01-01T00:00:00.000Z",
    checkoutConfigured: true,
  };
}

async function seedGuideSession(page: Page) {
  await page.addInitScript(
    ({ profile, ballot }) => {
      window.sessionStorage.setItem("valuesProfile", JSON.stringify(profile));
      window.sessionStorage.setItem("ballotInput", JSON.stringify(ballot));
    },
    { profile: valuesProfile, ballot: ballotInput }
  );
}

test("guest users are stopped at the guide gate", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("guest") });
  });
  await page.route("**/api/guide-access", async (route) => {
    await route.fulfill({
      json: {
        unlocked: false,
        canUnlock: false,
        source: null,
        electionPassCredits: 0,
        powerPassRunsRemaining: 0,
        powerPassExpiresAt: null,
        requiresAuth: true,
      },
    });
  });

  await page.goto("/guide");

  await expect(
    page.getByRole("heading", { name: "Create an account to unlock the guide" })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Create Free Account" })
  ).toBeVisible();
  await expect(page.getByText("Guest", { exact: true })).toBeVisible();
});

test("free users can unlock one starter analysis", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("free") });
  });
  await page.route("**/api/guide-access", async (route) => {
    await route.fulfill({
      json: {
        unlocked: false,
        canUnlock: false,
        source: null,
        electionPassCredits: 0,
        powerPassRunsRemaining: 0,
        powerPassExpiresAt: null,
      },
    });
  });
  await page.route("**/api/starter-analysis", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({ json: { result: null } });
      return;
    }

    await route.fulfill({
      json: {
        result: starterResult,
        starterAnalysesRemaining: 0,
      },
    });
  });

  await page.goto("/guide");

  await expect(page.getByText("Free Plan")).toBeVisible();
  await page
    .getByRole("button", { name: "Use Free Analysis" })
    .first()
    .click();

  await expect(
    page.getByRole("button", { name: "Starter Analysis Unlocked" })
  ).toBeVisible();
  await expect(page.getByText("Supports faster housing approvals near transit.")).toBeVisible();
  await expect(page.getByText("78")).toBeVisible();
});

test("pro users see full-ballot guide results", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("pro") });
  });
  await page.route("**/api/guide-access", async (route) => {
    await route.fulfill({
      json: {
        unlocked: true,
        canUnlock: false,
        source: "existing",
        electionPassCredits: 0,
        powerPassRunsRemaining: 8,
        powerPassExpiresAt: "2099-01-01T00:00:00.000Z",
      },
    });
  });
  await page.route("**/api/research", async (route) => {
    const body = [
      JSON.stringify({
        type: "candidate_start",
        candidateId: "cand-1",
        name: "Jane Doe",
        race: "Mayor",
      }),
      JSON.stringify({
        type: "candidate_result",
        candidateId: "cand-1",
        result: starterResult,
      }),
      JSON.stringify({
        type: "measure_start",
        measureId: "measure-1",
        title: "Amendment 1",
      }),
      JSON.stringify({
        type: "measure_result",
        measureId: "measure-1",
        result: measureResult,
      }),
      JSON.stringify({ type: "done" }),
      "",
    ].join("\n");

    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body,
    });
  });

  await page.goto("/guide");

  await expect(page.getByText("Power Pass", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Share Guide" })).toBeVisible();
  await expect(page.getByText("Amendment 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse" }).first()).toBeVisible();
});

test("pricing page shows checkout return state", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("pro") });
  });

  await page.goto("/pricing?checkout=success");

  await expect(
    page.getByText("Checkout completed. Stripe will add the pass to your account as soon as the webhook lands.")
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Election Pass" })).toBeVisible();
});
