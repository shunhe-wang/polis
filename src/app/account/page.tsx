"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";
import {
  safeLocalStorageRemove,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/browser-storage";

export default function AccountPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [confirmedEmail, setConfirmedEmail] = useState("");
  const [currentPassword, setCurrentPassword] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [consentGranted, setConsentGranted] = useState<boolean | null>(null);
  const [isRevoking, setIsRevoking] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/account", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        const data = await response.json().catch(() => null);
        if (!response.ok || typeof data?.email !== "string") {
          safeSessionStorageSet("authReturnTo", "/account");
          router.replace("/auth/login");
          return;
        }
        setEmail(data.email);
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError("Could not load account details.");
      });

    void fetch("/api/ai-consent", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return;
        const data = await response.json();
        setConsentGranted(Boolean(data.granted));
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setConsentGranted(null);
      });

    return () => controller.abort();
  }, [router]);

  async function revokeConsent() {
    setIsRevoking(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/ai-consent", { method: "DELETE" });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not revoke consent.");
        return;
      }
      setConsentGranted(false);
      setMessage("Z.AI data-sharing consent was revoked.");
    } catch {
      setError("Could not revoke consent.");
    } finally {
      setIsRevoking(false);
    }
  }

  async function deleteAccount() {
    setIsDeleting(true);
    setError(null);
    setMessage(null);
    try {
      const response = await fetch("/api/account", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: confirmedEmail,
          phrase: confirmationPhrase,
          password: currentPassword,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not delete the account.");
        return;
      }

      const supabase = createClient();
      await supabase?.auth.signOut({ scope: "local" });
      safeSessionStorageRemove("valuesProfile");
      safeSessionStorageRemove("ballotInput");
      safeSessionStorageRemove("authReturnTo");
      safeSessionStorageRemove("aiConsentReturnTo");
      safeLocalStorageRemove("valuesProfile");
      safeLocalStorageRemove("ballotInput");
      window.location.assign("/?account=deleted");
    } catch {
      setError("Could not delete the account.");
    } finally {
      setIsDeleting(false);
    }
  }

  const deletionConfirmed =
    Boolean(email) &&
    confirmedEmail.trim().toLowerCase() === email.toLowerCase() &&
    confirmationPhrase === "DELETE" &&
    currentPassword.length >= 6;

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="w-full max-w-2xl space-y-8">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Account</h1>
          <p className="mt-2 text-muted-foreground">
            Manage privacy choices and your Polis account.
          </p>
          {email && <p className="mt-2 text-sm">Signed in as {email}</p>}
        </div>

        <Card>
          <CardContent className="space-y-4 pt-6">
            <div>
              <h2 className="text-lg font-semibold">AI data sharing</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {consentGranted === true
                  ? "You approved the current Z.AI disclosure."
                  : consentGranted === false
                    ? "You have not approved the current Z.AI disclosure."
                    : "Checking your consent status..."}
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row">
              <Link
                href="/ai-consent"
                className={buttonVariants({ variant: "outline" })}
              >
                Review Disclosure
              </Link>
              {consentGranted && (
                <Button
                  variant="outline"
                  onClick={() => void revokeConsent()}
                  disabled={isRevoking}
                >
                  {isRevoking ? "Revoking..." : "Revoke Consent"}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>

        <Card className="border-red-500/30">
          <CardContent className="space-y-5 pt-6">
            <div>
              <h2 className="text-lg font-semibold text-red-700 dark:text-red-300">
                Delete account
              </h2>
              <p className="mt-1 text-sm text-muted-foreground">
                This permanently deletes your Polis login, saved profile,
                ballots, guides, credits, AI consent, and associated app data.
                Unused credits are forfeited. This cannot be undone.
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-email">Type your account email</Label>
              <Input
                id="delete-email"
                type="email"
                value={confirmedEmail}
                onChange={(event) => setConfirmedEmail(event.target.value)}
                placeholder={email || "you@example.com"}
                autoComplete="off"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-password">Current password</Label>
              <Input
                id="delete-password"
                type="password"
                value={currentPassword}
                onChange={(event) => setCurrentPassword(event.target.value)}
                placeholder="Your current password"
                autoComplete="current-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="delete-phrase">Type DELETE</Label>
              <Input
                id="delete-phrase"
                value={confirmationPhrase}
                onChange={(event) => setConfirmationPhrase(event.target.value)}
                placeholder="DELETE"
                autoComplete="off"
              />
            </div>
            <Button
              variant="destructive"
              onClick={() => void deleteAccount()}
              disabled={!deletionConfirmed || isDeleting}
            >
              {isDeleting ? "Deleting Account..." : "Permanently Delete Account"}
            </Button>
          </CardContent>
        </Card>

        {message && (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">
            {message}
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </main>
  );
}
