export interface AccountSummary {
  isAuthenticated: boolean;
  trustedAccount: boolean;
  emailVerified: boolean;
  trustReason: string | null;
  starterAnalysesRemaining: number;
  electionPassCredits: number;
  checkoutConfigured: boolean;
}

export const DEFAULT_ACCOUNT_SUMMARY: AccountSummary = {
  isAuthenticated: false,
  trustedAccount: false,
  emailVerified: false,
  trustReason: null,
  starterAnalysesRemaining: 0,
  electionPassCredits: 0,
  checkoutConfigured: false,
};
