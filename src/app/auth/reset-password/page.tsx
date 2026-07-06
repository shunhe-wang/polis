"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createClient } from "@/lib/supabase/client";

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createClient(), []);
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [hasSession, setHasSession] = useState<boolean | null>(() =>
    supabase ? null : false
  );
  const [isLoading, setIsLoading] = useState(false);
  const [updated, setUpdated] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getUser().then(({ data }) => setHasSession(Boolean(data.user)));
  }, [supabase]);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirmation) {
      setError("The passwords do not match.");
      return;
    }

    setIsLoading(true);
    setError(null);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setIsLoading(false);
    if (updateError) {
      setError(updateError.message);
      return;
    }
    setUpdated(true);
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-2xl font-bold tracking-tight">Choose a New Password</h1>
        </div>
        <Card>
          <CardContent className="pt-6">
            {hasSession === null ? (
              <p className="text-sm text-muted-foreground">Checking your reset link...</p>
            ) : !hasSession ? (
              <div className="space-y-4 text-sm">
                <p>This reset link is invalid or has expired.</p>
                <Link className="underline underline-offset-2" href="/auth/forgot-password">
                  Request a new link
                </Link>
              </div>
            ) : updated ? (
              <div className="space-y-4 text-sm">
                <p>Your password has been updated. You can continue using Polis.</p>
                <Link className="underline underline-offset-2" href="/account">
                  Continue to Account
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="password">New password</Label>
                  <Input id="password" type="password" minLength={8} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} required />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="confirmation">Confirm new password</Label>
                  <Input id="confirmation" type="password" minLength={8} autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} required />
                </div>
                {error && <p className="text-sm text-destructive">{error}</p>}
                <Button className="w-full" type="submit" disabled={isLoading}>
                  {isLoading ? "Updating..." : "Update Password"}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
    </main>
  );
}
