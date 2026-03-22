"use client";

import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";

export default function AdminPage() {
  // Stub data for the admin dashboard
  const stats = {
    totalUsers: 0,
    activeGuides: 0,
    researchRequests: 0,
    proUsers: 0,
  };

  return (
    <main className="flex flex-1 flex-col items-center px-4 py-8 sm:py-16">
      <div className="w-full max-w-4xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
              Admin Dashboard
            </h1>
            <Badge variant="secondary">Org License</Badge>
          </div>
          <p className="mt-2 text-sm text-muted-foreground">
            Manage your organization&apos;s Polis deployment.
          </p>
        </div>

        {/* Stats Grid */}
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <StatCard label="Total Users" value={stats.totalUsers} />
          <StatCard label="Active Guides" value={stats.activeGuides} />
          <StatCard label="Research Requests" value={stats.researchRequests} />
          <StatCard label="Pro Users" value={stats.proUsers} />
        </div>

        <Separator className="my-8" />

        {/* Org Settings Stub */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Organization Settings</h2>
          <Card>
            <CardContent className="py-6">
              <div className="space-y-4 text-sm text-muted-foreground">
                <StubRow label="Organization Name" value="Your Organization" />
                <StubRow label="License Tier" value="Enterprise" />
                <StubRow label="Seats Used" value="0 / 100" />
                <StubRow label="API Usage" value="0 requests this month" />
                <StubRow label="Billing" value="Not configured" />
              </div>
            </CardContent>
          </Card>
        </section>

        <Separator className="my-8" />

        {/* User Management Stub */}
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

        <Separator className="my-8" />

        {/* Branding Stub */}
        <section className="space-y-4">
          <h2 className="text-lg font-semibold">Custom Branding</h2>
          <Card>
            <CardContent className="py-12 text-center">
              <p className="text-sm text-muted-foreground">
                White-label branding options will be available in a future
                release.
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
