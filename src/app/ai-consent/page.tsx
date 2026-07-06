"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  AI_CONSENT_DISCLOSURE,
  CURRENT_AI_CONSENT_VERSION,
} from "@/lib/ai-consent";
import {
  safeSessionStorageGet,
  safeSessionStorageRemove,
  safeSessionStorageSet,
} from "@/lib/browser-storage";

function getSafeReturnTo(): string {
  const value = safeSessionStorageGet("aiConsentReturnTo");
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/guide";
}

export default function AiConsentPage() {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [alreadyGranted, setAlreadyGranted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    void fetch("/api/ai-consent", {
      cache: "no-store",
      signal: controller.signal,
    })
      .then(async (response) => {
        if (response.status === 401) {
          safeSessionStorageSet("authReturnTo", "/ai-consent");
          router.replace("/auth/login");
          return;
        }
        const data = await response.json().catch(() => null);
        if (!response.ok) {
          setError(data?.error ?? "Could not load consent status.");
          return;
        }
        setAlreadyGranted(Boolean(data?.granted));
      })
      .catch((fetchError) => {
        if (fetchError instanceof Error && fetchError.name === "AbortError") return;
        setError("Could not load consent status.");
      })
      .finally(() => {
        if (!controller.signal.aborted) setIsLoading(false);
      });

    return () => controller.abort();
  }, [router]);

  async function acceptConsent() {
    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/ai-consent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          accept: true,
          consentVersion: CURRENT_AI_CONSENT_VERSION,
        }),
      });
      const data = await response.json().catch(() => null);
      if (!response.ok) {
        setError(data?.error ?? "Could not record consent.");
        return;
      }

      const returnTo = getSafeReturnTo();
      safeSessionStorageRemove("aiConsentReturnTo");
      router.replace(returnTo);
      router.refresh();
    } catch {
      setError("Could not record consent.");
    } finally {
      setIsSaving(false);
    }
  }

  function declineConsent() {
    safeSessionStorageRemove("aiConsentReturnTo");
    router.push("/");
  }

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="w-full max-w-2xl space-y-6">
        <div>
          <p className="text-sm font-medium text-cyan-800 dark:text-cyan-200">
            Your choice
          </p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight sm:text-4xl">
            Allow Z.AI to process your voter-guide information?
          </h1>
          <p className="mt-4 leading-relaxed text-muted-foreground">
            Polis will not send this information to Z.AI unless you choose
            “Allow and continue.” You can cancel now and keep using non-AI
            ballot browsing and source links.
          </p>
        </div>

        <Card>
          <CardContent className="space-y-5 pt-6">
            <div>
              <h2 className="font-semibold">Why it is shared</h2>
              <p className="mt-1 text-sm text-muted-foreground">
                {AI_CONSENT_DISCLOSURE.purpose}
              </p>
            </div>
            <div>
              <h2 className="font-semibold">Information that may be sent</h2>
              <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted-foreground">
                {AI_CONSENT_DISCLOSURE.dataCategories.map((category) => (
                  <li key={category}>{category}</li>
                ))}
              </ul>
            </div>
            <p className="text-sm text-muted-foreground">
              Z.AI processes this information as Polis’s AI provider. Review
              the full <Link href="/privacy" className="underline underline-offset-2">Privacy Policy</Link>{" "}
              before deciding. You can revoke consent later from Account.
            </p>
          </CardContent>
        </Card>

        {alreadyGranted && (
          <p className="rounded-xl border border-emerald-500/20 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-900 dark:text-emerald-100">
            You already approved the current disclosure. Continuing will not
            create a duplicate record.
          </p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            className="rounded-full"
            onClick={() => void acceptConsent()}
            disabled={isLoading || isSaving}
          >
            {isSaving ? "Saving..." : "Allow and Continue"}
          </Button>
          <Button
            variant="outline"
            className="rounded-full"
            onClick={declineConsent}
            disabled={isSaving}
          >
            Not Now
          </Button>
        </div>
      </div>
    </main>
  );
}
