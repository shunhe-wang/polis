"use client";

import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-16">
      <div className="mx-auto max-w-2xl text-center">
        <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
          Polis
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Informed Citizens, Stronger Democracy
        </p>
        <p className="mt-6 text-base leading-relaxed text-muted-foreground">
          Tell us what matters to you. We&apos;ll research your candidates,
          score their alignment with your values, and show our work — every
          recommendation is cited and explainable.
        </p>
        <div className="mt-10 flex flex-col gap-3 sm:flex-row sm:justify-center">
          <Link
            href="/onboarding"
            className={buttonVariants({ size: "lg" })}
          >
            Get Your Voter Guide
          </Link>
        </div>
        <p className="mt-8 text-xs text-muted-foreground">
          Non-partisan. Transparent reasoning. Your values, your guide.
        </p>
      </div>
    </main>
  );
}
