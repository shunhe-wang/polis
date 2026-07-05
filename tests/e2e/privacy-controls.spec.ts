import { expect, test } from "@playwright/test";

test("AI consent names Z.AI, discloses data, and records explicit approval", async ({
  page,
}) => {
  let approval: unknown = null;

  await page.route("**/api/ai-consent", async (route) => {
    if (route.request().method() === "POST") {
      approval = route.request().postDataJSON();
      await route.fulfill({ json: { granted: true } });
      return;
    }

    await route.fulfill({
      json: {
        granted: false,
        consentVersion: "2026-07-05-v1",
      },
    });
  });

  await page.goto("/ai-consent");

  await expect(
    page.getByRole("heading", {
      name: "Allow Z.AI to process your voter-guide information?",
    })
  ).toBeVisible();
  await expect(
    page.getByText("political identity and free-text values")
  ).toBeVisible();
  await expect(
    page.getByText("uploaded or pasted ballot content")
  ).toBeVisible();

  await page.getByRole("button", { name: "Allow and Continue" }).click();
  await page.waitForURL("**/guide");

  expect(approval).toEqual({
    accept: true,
    consentVersion: "2026-07-05-v1",
  });
});

test("account deletion requires the signed-in email and exact DELETE phrase", async ({
  page,
}) => {
  let deletion: unknown = null;

  await page.route("**/api/account", async (route) => {
    if (route.request().method() === "DELETE") {
      deletion = route.request().postDataJSON();
      await route.fulfill({ json: { deleted: true } });
      return;
    }

    await route.fulfill({
      json: {
        isAuthenticated: true,
        trustedAccount: true,
        emailVerified: true,
        trustReason: null,
        starterAnalysesRemaining: 1,
        electionPassCredits: 0,
        checkoutConfigured: true,
        email: "user@example.com",
      },
    });
  });
  await page.route("**/api/ai-consent", async (route) => {
    await route.fulfill({ json: { granted: true } });
  });

  await page.goto("/account");

  const deleteButton = page.getByRole("button", {
    name: "Permanently Delete Account",
  });
  await expect(deleteButton).toBeDisabled();

  await page.getByLabel("Type your account email").fill("user@example.com");
  await page.getByLabel("Current password").fill("correct-horse");
  await page.getByLabel("Type DELETE").fill("DELETE");
  await expect(deleteButton).toBeEnabled();
  await deleteButton.click();
  await page.waitForURL("**/?account=deleted");
  await expect(
    page.getByText(
      "Your Polis account and user-linked app data were permanently deleted."
    )
  ).toBeVisible();

  expect(deletion).toEqual({
    email: "user@example.com",
    phrase: "DELETE",
    password: "correct-horse",
  });
});
