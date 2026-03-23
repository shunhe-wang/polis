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

async function seedValuesProfileOnly(page: Page) {
  await page.addInitScript(({ profile }) => {
    window.sessionStorage.setItem("valuesProfile", JSON.stringify(profile));
  }, { profile: valuesProfile });
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
  await expect(
    page.locator('span[data-slot="badge"]').filter({ hasText: "Guest" }).first()
  ).toBeVisible();
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

  await expect(
    page.locator('span[data-slot="badge"]').filter({ hasText: "Power Pass" }).first()
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Save & Share Guide" })).toBeVisible();
  await expect(page.getByText("Amendment 1")).toBeVisible();
  await expect(page.getByRole("button", { name: "Collapse" }).first()).toBeVisible();
  await page.getByRole("button", { name: "Take to Polls" }).click();
  await expect(page.getByRole("heading", { name: "Your Quick Ballot" })).toBeVisible();
  await expect(page.getByText("Recommended pick")).toBeVisible();
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
  await expect(page.getByRole("button", { name: "Sign Out" })).toBeVisible();
});

test("start page makes guest guide stop explicit", async ({ page }) => {
  await page.goto("/start?intent=guide");

  await expect(
    page.getByRole("heading", { name: "Create an account to open the guide." })
  ).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to Ballot" })).toBeVisible();
  await expect(
    page.getByText("Guest mode stops at ballot building.")
  ).toBeVisible();
});

test("home page lets returning users jump back into their guide", async ({ page }) => {
  await page.addInitScript(
    ({ profile, ballot }) => {
      window.sessionStorage.setItem("valuesProfile", JSON.stringify(profile));
      window.sessionStorage.setItem("ballotInput", JSON.stringify(ballot));
    },
    { profile: valuesProfile, ballot: ballotInput }
  );
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("pro") });
  });
  await page.route("**/api/guide", async (route) => {
    await route.fulfill({
      json: [{ id: "guide-123", created_at: "2026-03-22T00:00:00.000Z", ballot_input: ballotInput, is_public: false }],
    });
  });

  await page.goto("/");

  await expect(page.getByRole("link", { name: "Open Saved Guide" }).first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Passes" }).first()).toBeVisible();
});

test("ballot page shows recovery guidance when lookup is unavailable", async ({ page }) => {
  await seedValuesProfileOnly(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("guest") });
  });
  await page.route("**/api/ballot/lookup?*", async (route) => {
    await route.fulfill({
      status: 200,
      json: {
        state: "VA",
        election: null,
        availableElections: [],
        requiresElectionSelection: false,
        primaryParties: [],
        races: [],
        measures: [],
        importMeta: {
          importId: null,
          source: "google_civic",
          status: "unavailable",
          confidence: 20,
          message:
            "Google Civic did not return a ballot for this address yet. Check an official election source, add races manually, or come back later as election data becomes available.",
          fallbackLinks: [
            {
              label: "Virginia voting page (Vote.gov)",
              url: "https://vote.gov/register/virginia/",
              kind: "official",
            },
            {
              label: "Official sample ballot",
              url: "https://example.com/official-ballot",
              kind: "official",
            },
          ],
          locality: {
            city: "Alexandria",
            county: null,
            state: "VA",
            zip: "22314",
          },
        },
        error: null,
      },
    });
  });

  await page.goto("/ballot");
  await page.getByLabel("Street Address").fill("123 Main St");
  await page.getByLabel("City").fill("Alexandria");
  await page.getByLabel("State").fill("VA");
  await page.getByLabel("ZIP Code").fill("22314");
  await page.getByRole("button", { name: "Find My Ballot" }).click();

  await expect(page.getByText("Ballot import unavailable")).toBeVisible();
  await expect(page.getByText("Best next steps")).toBeVisible();
  await expect(page.getByRole("link", { name: "Virginia voting page (Vote.gov)" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Official sample ballot" })).toBeVisible();
});

test("authenticated users can review and apply a parsed ballot draft", async ({ page }) => {
  await seedValuesProfileOnly(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary("free") });
  });
  await page.route("**/api/ballot/review-draft", async (route) => {
    if (route.request().method() === "GET") {
      await route.fulfill({
        json: { draft: null, normalizedBallot: null },
      });
      return;
    }

    await route.fulfill({
      json: {
        draft: {
          election: {
            name: "Virginia General Election",
            electionDay: "2026-11-03",
            kind: "general",
            selectedParty: null,
          },
          races: [
            {
              name: "Mayor",
              level: "local",
              contestType: "General",
              candidates: [
                { name: "Jane Doe", party: "Democrat" },
                { name: "John Roe", party: "Independent" },
              ],
            },
          ],
          measures: [],
          confidence: 82,
          notes: ["Review candidate names before applying."],
        },
        normalizedBallot: {
          address: "",
          state: "VA",
          election: {
            id: "draft-election",
            name: "Virginia General Election",
            electionDay: "2026-11-03",
            kind: "general",
            selectedParty: null,
          },
          importMeta: {
            importId: null,
            source: "official_upload",
            status: "partial",
            confidence: 82,
            message: "Parsed from pasted ballot text. Review candidate names, parties, and measures before continuing.",
            fallbackLinks: [],
            locality: null,
          },
          races: [
            {
              id: "draft-race-1",
              name: "Mayor",
              level: "local",
              contestType: "General",
              candidates: [
                { id: "draft-cand-1", name: "Jane Doe", party: "Democrat" },
                { id: "draft-cand-2", name: "John Roe", party: "Independent" },
              ],
            },
          ],
          measures: [],
        },
      },
    });
  });

  await page.goto("/ballot");
  await page.getByPlaceholder("Paste the official ballot text here. Include the election title, each race, candidate names, and any ballot measures.").fill(
    "Virginia General Election\nMayor\nJane Doe\nJohn Roe\n"
  );
  await page.getByRole("button", { name: "Parse Ballot Text" }).click();

  await expect(page.getByText("Review parsed draft")).toBeVisible();
  await page.locator('input[value="Mayor"]').fill("Mayor of Alexandria");
  await page.getByRole("button", { name: "Apply Draft to Ballot" }).last().click();

  await expect(page.getByText("1 race on your ballot")).toBeVisible();
  await expect(page.getByText("Mayor of Alexandria")).toBeVisible();
  await expect(
    page.locator("li").filter({ hasText: "Jane Doe" }).filter({ hasText: "(D)" }).first()
  ).toBeVisible();
});
