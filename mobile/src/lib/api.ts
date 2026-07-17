export interface MobileAccountSummary {
  isAuthenticated: boolean;
  trustedAccount: boolean;
  emailVerified: boolean;
  trustReason: string | null;
  starterAnalysesRemaining: number;
  electionPassCredits: number;
  email: string | null;
}

export async function fetchAccountSummary(input: {
  apiUrl: string;
  accessToken: string;
  fetcher?: typeof fetch;
}): Promise<MobileAccountSummary> {
  const response = await (input.fetcher ?? fetch)(`${input.apiUrl}/api/account`, {
    headers: { Authorization: `Bearer ${input.accessToken}` },
    cache: "no-store",
  });
  const body = (await response.json().catch(() => null)) as
    | (Partial<MobileAccountSummary> & { error?: string })
    | null;

  if (!response.ok) {
    throw new Error(body?.error ?? "Could not load the Polis account");
  }
  if (!body || body.isAuthenticated !== true || typeof body.electionPassCredits !== "number") {
    throw new Error("The Polis account response was invalid");
  }
  return body as MobileAccountSummary;
}
