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
  measures: [],
} as const;

function accountSummary(options?: {
  isAuthenticated?: boolean;
  trustedAccount?: boolean;
  electionPassCredits?: number;
  starterAnalysesRemaining?: number;
}) {
  const trusted = options?.trustedAccount ?? false;
  return {
    isAuthenticated: options?.isAuthenticated ?? false,
    trustedAccount: trusted,
    emailVerified: trusted,
    trustReason: trusted ? null : "Verify your email before using AI features.",
    starterAnalysesRemaining: options?.starterAnalysesRemaining ?? 0,
    electionPassCredits: options?.electionPassCredits ?? 0,
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

test("password sign-in exposes account recovery", async ({ page }) => {
  await page.goto("/auth/login");
  await expect(page.getByRole("link", { name: "Forgot password?" })).toBeVisible();
  await page.getByRole("link", { name: "Forgot password?" }).click();
  await expect(page.getByRole("heading", { name: "Reset Your Password" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Send Reset Link" })).toBeVisible();
});

test("mobile header keeps signed-in navigation in a compact menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.route("**/api/account", async (route) => {
    await route.fulfill({
      json: accountSummary({
        isAuthenticated: true,
        trustedAccount: true,
        electionPassCredits: 1,
      }),
    });
  });

  await page.goto("/");
  await page.getByLabel("Open navigation menu").click();
  const mobileNav = page.getByRole("navigation", { name: "Mobile account navigation" });
  await expect(mobileNav.getByRole("link", { name: "My Guides" })).toBeVisible();
  await expect(mobileNav.getByRole("link", { name: "Account", exact: true })).toBeVisible();
  await expect(mobileNav.getByRole("button", { name: "Sign Out" })).toBeVisible();
});

test("pricing shows guest/auth options when logged out", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary() });
  });

  await page.goto("/pricing");

  const main = page.getByRole("main");
  await expect(main.getByRole("button", { name: "Continue as Guest" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Sign In" })).toBeVisible();
  await expect(main.getByRole("button", { name: "Create Account" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Election Pass" })).toHaveCount(0);
});

test("pricing shows buy CTA for signed-in accounts with zero credits", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({
      json: accountSummary({
        isAuthenticated: true,
        trustedAccount: true,
        starterAnalysesRemaining: 1,
      }),
    });
  });

  await page.goto("/pricing");

  await expect(page.getByText("Account balance:")).toBeVisible();
  await expect(page.getByText("$1.00", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Election Pass" })).toBeVisible();
});

test("pricing shows available credits and continue CTA", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({
      json: accountSummary({
        isAuthenticated: true,
        trustedAccount: true,
        electionPassCredits: 2,
        starterAnalysesRemaining: 0,
      }),
    });
  });

  await page.goto("/pricing");

  await expect(page.getByText("Credits ready to use")).toBeVisible();
  await expect(page.getByRole("button", { name: "Continue to Guide" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Buy Another Credit" })).toBeVisible();
});

test("pricing shows checkout return state", async ({ page }) => {
  await page.route("**/api/account", async (route) => {
    await route.fulfill({
      json: accountSummary({
        isAuthenticated: true,
        trustedAccount: true,
      }),
    });
  });

  await page.goto("/pricing?checkout=success");

  await expect(
    page.getByText("Checkout completed. Your credit will appear as soon as Stripe finishes the webhook.")
  ).toBeVisible();
});

const candidateResult = {
  candidateId: "cand-1",
  name: "Jane Doe",
  party: "Independent",
  race: "Mayor",
  alignmentScore: 82,
  issueBreakdown: [],
  likes: [
    {
      text: "Supports building more housing.",
      sourceUrl: "https://example.com/housing",
      sourceTitle: "Example News",
    },
  ],
  concerns: [],
  confidence: "medium",
  reasoning: "Aligned on housing and rights priorities.",
} as const;

test("candidate cards offer a content report form", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/research", async (route) => {
    const events = [
      {
        type: "candidate_start",
        candidateId: "cand-1",
        name: "Jane Doe",
        race: "Mayor",
      },
      { type: "candidate_result", candidateId: "cand-1", result: candidateResult },
      { type: "done" },
    ];
    await route.fulfill({
      status: 200,
      contentType: "application/x-ndjson",
      body: `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    });
  });
  await page.route("**/api/account", async (route) => {
    await route.fulfill({
      json: accountSummary({
        isAuthenticated: true,
        trustedAccount: true,
        electionPassCredits: 1,
      }),
    });
  });
  await page.route("**/api/guide-access", async (route) => {
    await route.fulfill({
      json: {
        unlocked: true,
        canUnlock: false,
        source: "existing",
        electionPassCredits: 1,
      },
    });
  });
  await page.route("**/api/starter-analysis", async (route) => {
    await route.fulfill({ json: {} });
  });
  let reportPayload: Record<string, unknown> | null = null;
  await page.route("**/api/reports", async (route) => {
    reportPayload = route.request().postDataJSON();
    await route.fulfill({ status: 201, json: { id: "report-1", status: "open" } });
  });

  await page.goto("/guide");

  await page.getByRole("button", { name: "Report a problem" }).first().click();
  await page
    .getByPlaceholder(/Tell us what is incorrect/)
    .fill("The party label is wrong.");
  await page.getByRole("button", { name: "Submit report" }).click();

  await expect(
    page.getByText("Thanks. Your report was received", { exact: false })
  ).toBeVisible();
  expect(reportPayload).toMatchObject({
    category: "inaccurate_claim",
    subjectType: "candidate",
    subjectName: "Jane Doe",
    raceName: "Mayor",
    details: "The party label is wrong.",
  });
});

test("guide shows account gate for guests", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary() });
  });

  await page.goto("/guide");

  await expect(page.getByText("Create an account to unlock the guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
});
