"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { syncToSupabase } from "@/lib/persistence";
import {
  isDisposableEmailDomain,
  shouldRequireVerifiedEmail,
} from "@/lib/account-trust";

export default function SignupPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const supabase = createClient();

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!supabase) {
      setError("Authentication is not configured yet.");
      return;
    }

    setIsLoading(true);
    setError(null);

    if (isDisposableEmailDomain(email)) {
      setError(
        "Use a real email address. Temporary inboxes are blocked for free analyses and paid unlocks."
      );
      setIsLoading(false);
      return;
    }

    const { data, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setIsLoading(false);
    } else {
      if (data.session) {
        await syncToSupabase();
        const returnTo = sessionStorage.getItem("authReturnTo") ?? "/onboarding";
        sessionStorage.removeItem("authReturnTo");
        router.push(returnTo);
        router.refresh();
        return;
      }

      setSuccess(true);
      setIsLoading(false);
    }
  };

  if (success) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="w-full max-w-sm text-center">
          <h1 className="text-2xl font-bold tracking-tight">Check Your Email</h1>
          <p className="mt-4 text-sm text-muted-foreground">
            We sent a confirmation link to <strong>{email}</strong>. Click it to
            activate your account, then come back and sign in.
          </p>
          {shouldRequireVerifiedEmail() && (
            <p className="mt-3 text-sm text-muted-foreground">
              Verified email is required before free analyses, paid unlocks, or
              full guide research will run.
            </p>
          )}
          <Link
            href="/auth/login"
            className="mt-6 inline-block text-sm underline underline-offset-2 hover:text-foreground"
          >
            Back to Sign In
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Create Account</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sign up to save your values profile, keep your ballot, and unlock 1
            free starter candidate analysis.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            Use a real email you can verify. Temporary inboxes are blocked for
            AI features and paid unlocks.
          </p>
        </div>

        <Card>
          <CardContent className="pt-6">
            <form onSubmit={handleSignup} className="space-y-4">
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
                <Label htmlFor="password">Password</Label>
                <Input
                  id="password"
                  type="password"
                  placeholder="At least 6 characters"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
              </div>

              {error && (
                <p className="text-sm text-destructive">{error}</p>
              )}

              <Button
                type="submit"
                className="w-full"
                disabled={isLoading}
              >
                {isLoading ? "Creating account..." : "Create Account"}
              </Button>
            </form>
          </CardContent>
        </Card>

        <p className="mt-4 text-center text-sm text-muted-foreground">
          Already have an account?{" "}
          <Link
            href="/auth/login"
            className="underline underline-offset-2 hover:text-foreground"
          >
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
