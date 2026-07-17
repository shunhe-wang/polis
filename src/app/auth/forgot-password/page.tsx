"use client";

import Link from "next/link";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { buildPasswordRecoveryRedirect } from "@/lib/auth-recovery";
import { createClient } from "@/lib/supabase/client";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    const supabase = createClient();
    if (!supabase) {
      setError("Authentication is not configured yet.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const { error: resetError } = await supabase.auth.resetPasswordForEmail(
      email,
      { redirectTo: buildPasswordRecoveryRedirect(window.location.origin) }
    );
    setIsLoading(false);

    if (resetError) {
      setError("We could not send a reset email. Please try again shortly.");
      return;
    }
    setSent(true);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Reset Your Password</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Enter your account email and we&apos;ll send you a secure reset link.
          </p>
        </div>
        <Card>
          <CardContent className="pt-6">
            {sent ? (
              <div className="space-y-4 text-sm">
                <p>
                  If an account exists for that email, a reset link is on its way.
                  Check your inbox and spam folder.
                </p>
                <Link className="underline underline-offset-2" href="/auth/login">
                  Back to Sign In
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={email}
                    onChange={(event) => setEmail(event.target.value)}
                    autoComplete="email"
                    required
                  />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" type="submit" disabled={isLoading}>
                  {isLoading ? "Sending..." : "Send Reset Link"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
