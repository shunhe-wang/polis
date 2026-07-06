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

test("guide shows account gate for guests", async ({ page }) => {
  await seedGuideSession(page);
  await page.route("**/api/account", async (route) => {
    await route.fulfill({ json: accountSummary() });
  });

  await page.goto("/guide");

  await expect(page.getByText("Create an account to unlock the guide")).toBeVisible();
  await expect(page.getByRole("button", { name: "Create Account" })).toBeVisible();
});
