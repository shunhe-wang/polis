import { describe, expect, it } from "vitest";
import { isValidAccountDeletionConfirmation } from "./account-deletion";

describe("account deletion confirmation", () => {
  it("requires both the signed-in email and the DELETE phrase", () => {
    expect(
      isValidAccountDeletionConfirmation(
        {
          email: " User@Example.com ",
          phrase: "DELETE",
          password: "correct-horse",
        },
        "user@example.com"
      )
    ).toBe(true);

    expect(
      isValidAccountDeletionConfirmation(
        {
          email: "other@example.com",
          phrase: "DELETE",
          password: "correct-horse",
        },
        "user@example.com"
      )
    ).toBe(false);

    expect(
      isValidAccountDeletionConfirmation(
        {
          email: "user@example.com",
          phrase: "delete",
          password: "correct-horse",
        },
        "user@example.com"
      )
    ).toBe(false);

    expect(
      isValidAccountDeletionConfirmation(
        { email: "user@example.com", phrase: "DELETE", password: "short" },
        "user@example.com"
      )
    ).toBe(false);
  });

  it("rejects malformed request bodies", () => {
    expect(isValidAccountDeletionConfirmation(null, "user@example.com")).toBe(
      false
    );
    expect(
      isValidAccountDeletionConfirmation(
        { email: "user@example.com" },
        "user@example.com"
      )
    ).toBe(false);
  });
});
