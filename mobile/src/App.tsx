import { Capacitor } from "@capacitor/core";
import type { Session } from "@supabase/supabase-js";
import { useEffect, useState } from "react";
import { fetchAccountSummary, type MobileAccountSummary } from "./lib/api";
import { getMobileConfig, type MobileConfig } from "./lib/config";
import {
  fulfillPurchasedTransaction,
  purchaseElectionPass,
  retryUnfinishedTransactions,
  StoreKit,
  type StoreKitProduct,
} from "./lib/purchases";
import { getSupabase } from "./lib/supabase";

export default function App() {
  try {
    return <ConfiguredApp config={getMobileConfig()} />;
  } catch (error) {
    return (
      <main className="screen centered">
        <section className="auth-card">
          <div className="brand-mark">P</div>
          <p className="eyebrow">Polis for iPhone</p>
          <h1>Configuration needed</h1>
          <p className="message" role="alert">
            {error instanceof Error ? error.message : "Mobile configuration is missing"}
          </p>
        </section>
      </main>
    );
  }
}

function ConfiguredApp({ config }: { config: MobileConfig }) {
  const supabase = getSupabase(config);
  const [session, setSession] = useState<Session | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [account, setAccount] = useState<MobileAccountSummary | null>(null);
  const [product, setProduct] = useState<StoreKitProduct | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function refreshAccount(activeSession: Session) {
    const summary = await fetchAccountSummary({
      apiUrl: config.apiUrl,
      accessToken: activeSession.access_token,
    });
    setAccount(summary);
  }

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      if (!nextSession) setAccount(null);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshAccount(session).catch((error: unknown) => {
      setMessage(error instanceof Error ? error.message : "Could not load account");
    });
    if (Capacitor.getPlatform() === "ios") {
      void StoreKit.getProduct({ productId: config.storeKitProductId })
        .then(setProduct)
        .catch(() => setMessage("Election Pass purchasing is not configured yet."));
      void retryUnfinishedTransactions({
        apiUrl: config.apiUrl,
        accessToken: session.access_token,
      })
        .then(async (count) => {
          if (count > 0) await refreshAccount(session);
        })
        .catch(() => setMessage("A previous purchase will retry when the service is available."));
    }
  }, [session]);

  // Deliver purchases that complete outside the in-app flow, such as Ask to
  // Buy approvals that arrive minutes after the purchase sheet was dismissed.
  useEffect(() => {
    if (!session || Capacitor.getPlatform() !== "ios") return;
    const handlePromise = StoreKit.addListener(
      "transactionUpdated",
      (transaction) => {
        void fulfillPurchasedTransaction({
          apiUrl: config.apiUrl,
          accessToken: session.access_token,
          transaction,
        })
          .then(async () => {
            await refreshAccount(session);
            setMessage("Election Pass added.");
          })
          .catch(() => {
            setMessage(
              "A purchase could not be delivered yet. It will retry on the next launch."
            );
          });
      }
    );
    return () => {
      void handlePromise.then((handle) => handle.remove());
    };
  }, [session]);

  async function signIn(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);
    if (error) setMessage(error.message);
  }

  async function buyPass() {
    if (!session) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await purchaseElectionPass({
        apiUrl: config.apiUrl,
        accessToken: session.access_token,
        productId: config.storeKitProductId,
        appAccountToken: session.user.id,
      });
      if ("status" in result) {
        setMessage(result.status === "pending" ? "Purchase approval is pending." : "Purchase cancelled.");
      } else {
        await refreshAccount(session);
        setMessage(result.alreadyFulfilled ? "Your Election Pass was already delivered." : "Election Pass added.");
      }
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Purchase failed");
    } finally {
      setBusy(false);
    }
  }

  if (!session) {
    return (
      <main className="screen centered">
        <section className="auth-card">
          <div className="brand-mark">P</div>
          <p className="eyebrow">Polis for iPhone</p>
          <h1>Your voter guide, in your pocket.</h1>
          <p className="muted">Sign in with the same account you use on the web.</p>
          <form onSubmit={signIn}>
            <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
            <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
            <button disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
          </form>
          {message && <p className="message" role="status">{message}</p>}
          <a href={`${config.apiUrl}/auth/forgot-password`} target="_blank" rel="noreferrer">Forgot password?</a>
        </section>
      </main>
    );
  }

  return (
    <main className="screen">
      <header className="mobile-header">
        <div><p className="eyebrow">Polis</p><h1>Election dashboard</h1></div>
        <button className="quiet" onClick={() => void supabase.auth.signOut()}>Sign out</button>
      </header>
      <section className="balance-card">
        <p className="muted">Signed in as {account?.email ?? session.user.email}</p>
        <strong>{account?.electionPassCredits ?? "—"}</strong>
        <span>Election Pass credit{account?.electionPassCredits === 1 ? "" : "s"}</span>
      </section>
      <section className="action-card">
        <p className="eyebrow">Election Pass</p>
        <h2>Unlock one complete ballot guide</h2>
        <p className="muted">Credits do not expire and work on web and iPhone.</p>
        <button disabled={busy || !product || !account?.trustedAccount} onClick={() => void buyPass()}>
          {busy ? "Working…" : product ? `Buy for ${product.displayPrice}` : "StoreKit available on iPhone"}
        </button>
        {!account?.trustedAccount && account?.trustReason && <p className="message">{account.trustReason}</p>}
      </section>
      <section className="action-card secondary">
        <h2>Continue your guide</h2>
        <p className="muted">The bundled ballot and guide experience is the next mobile tranche.</p>
        <a className="button-link" href={`${config.apiUrl}/guides`} target="_blank" rel="noreferrer">Open saved guides</a>
      </section>
      {message && <p className="message floating" role="status">{message}</p>}
    </main>
  );
}
