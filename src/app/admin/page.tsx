import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

export default async function AdminPage() {
  const supabase = await createClient();

  if (!supabase) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="text-center">
          <h1 className="text-2xl font-bold">Admin Unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Supabase authentication is not configured.
          </p>
        </div>
      </main>
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/auth/login");
  }

  if (!isAdminEmail(user.email)) {
    return (
      <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
        <div className="max-w-md text-center">
          <h1 className="text-2xl font-bold">Access Denied</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            This area is restricted to configured admin accounts.
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            Set `ADMIN_EMAILS` to a comma-separated allowlist to grant access.
          </p>
          <Link
            href="/"
            className={buttonVariants({ variant: "outline", className: "mt-6" })}
          >
            Back Home
          </Link>
        </div>
      </main>
    );
  }

  const stats = {
    totalUsers: 0,
    activeGuides: 0,
    researchRequests: 0,
    proUsers: 0,
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-4xl">
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Admin Dashboard
            </h1>
            <Badge variant="secondary">Restricted</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Signed in as {user.email}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Active Guides" value={stats.activeGuides} />
          <StatCard label="Research Requests" value={stats.researchRequests} />
          <StatCard label="Pro Users" value={stats.proUsers} />
        </div>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Organization Settings</h2>
          <Card>
            <CardContent className="py-6">
              <div className="space-y-4 text-sm text-muted-foreground">
                <StubRow label="Organization Name" value="Your Organization" />
                <StubRow label="License Tier" value="Enterprise" />
                <StubRow label="Seats Used" value="0 / 100" />
                <StubRow label="API Usage" value="Not yet wired" />
                <StubRow label="Billing" value="Not configured" />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-8" />

        <section className="space-y-4">
          <h2 className="text-lg font-semibold">User Management</h2>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                User management will be available in a future release.
              </p>
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <Card>
      <CardContent className="pt-4 text-center">
        <p className="text-2xl font-bold">{value}</p>
        <p className="mt-1 text-xs text-muted-foreground">{label}</p>
      </CardContent>
    </Card>
  );
}

function StubRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between">
      <span className="font-medium text-foreground">{label}</span>
      <span>{value}</span>
    </div>
  );
}
