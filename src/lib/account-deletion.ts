interface AccountDeletionConfirmation {
  email: string;
  phrase: string;
  password: string;
}

export function isValidAccountDeletionConfirmation(
  value: unknown,
  signedInEmail: string | null | undefined
): value is AccountDeletionConfirmation {
  if (!value || typeof value !== "object" || !signedInEmail) {
    return false;
  }

  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.email === "string" &&
    candidate.email.trim().toLowerCase() === signedInEmail.trim().toLowerCase() &&
    candidate.phrase === "DELETE" &&
    typeof candidate.password === "string" &&
    candidate.password.length >= 6
  );
}
