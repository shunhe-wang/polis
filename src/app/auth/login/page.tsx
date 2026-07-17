"use client";

import { useState, useSyncExternalStore } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { syncToSupabase } from "@/lib/persistence";

// The values read below never change during a page visit, so the store never
// emits; useSyncExternalStore is used purely for its hydration-safe
// server-snapshot handling.
const subscribeToNothing = () => () => {};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [hasSubmitted, setHasSubmitted] = useState(false);

  // The server render has no query string; useSyncExternalStore hydrates with
  // the server snapshot and re-renders with the client value without a
  // hydration mismatch.
  const authCallbackFailed = useSyncExternalStore(
    subscribeToNothing,
    () =>
      new URLSearchParams(window.location.search).get("error") ===
      "auth_failed",
    () => false
  );
  const displayedError =
    error ??
    (authCallbackFailed && !hasSubmitted
      ? "We couldn't finish signing you in. Please try again."
      : null);

  const supabase = createClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setHasSubmitted(true);
    if (!supabase) {
      setError("Authentication is not configured yet.");
      return;
    }

    setIsLoading(true);
    setError(null);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
    } else {
      await syncToSupabase();
      const returnTo = sessionStorage.getItem("authReturnTo") ?? "/onboarding";
      sessionStorage.removeItem("authReturnTo");
      router.push(returnTo);
      router.refresh();
    }
  };

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Sign In</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign in to keep your ballot, reuse your profile, and access your
            account credits.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                />
              </div>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="password">Password</Label>
                  <Link
                    href="/auth/forgot-password"
                    className="text-xs underline underline-offset-2 hover:text-foreground"
                  >
                    Forgot password?
                  </Link>
                </div>
                <Input
                  id="password"
                  type="password"
                  placeholder="Your password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                />
              </div>

              {displayedError && (
                <p className="text-sm text-destructive">{displayedError}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Signing in..." : "Sign In"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Don&apos;t have an account?{" "}
          <Link
            href="/auth/signup"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
