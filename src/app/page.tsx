"use client";

import Link from "next/link";
import { ArrowRight, CheckCircle2, ShieldCheck, Sparkles } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";

export default function HomePage() {
  return (
    <main className="flex flex-1 flex-col items-center justify-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto grid w-full max-w-6xl gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-center">
        <section className="space-y-6">
          <div className="inline-flex items-center gap-2 rounded-full border border-black/5 bg-white/75 px-3 py-1 text-xs font-medium text-foreground/80 shadow-sm backdrop-blur-sm dark:border-white/10 dark:bg-white/6">
            <Sparkles className="size-3.5 text-cyan-700 dark:text-cyan-300" />
            Personalized, cited, and explainable
          </div>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-5xl font-semibold tracking-tight text-balance sm:text-6xl">
              Your ballot, translated into a guide that actually matches your values.
            </h1>
            <p className="max-w-2xl text-lg leading-relaxed text-muted-foreground sm:text-xl">
              Polis helps you turn a messy local ballot into something usable:
              issue priorities, candidate research, cited reasoning, and a clear
              sense of where each option lines up with what you care about.
            </p>
          </div>
          <div className="flex flex-col gap-3 sm:flex-row">
            <Link
              href="/start"
              className={buttonVariants({
                size: "lg",
                className:
                  "rounded-full bg-[linear-gradient(135deg,rgba(14,116,144,0.96),rgba(15,23,42,0.96))] px-5 text-white shadow-[0_20px_40px_-20px_rgba(8,47,73,0.75)] hover:opacity-95 dark:text-white",
              })}
            >
              Get Your Voter Guide
              <ArrowRight />
            </Link>
            <Link
              href="/auth/login"
              className={buttonVariants({
                size: "lg",
                variant: "outline",
                className: "rounded-full px-5",
              })}
            >
              Sign In
            </Link>
          </div>
          <div className="grid gap-3 pt-2 sm:grid-cols-3">
            {[
              {
                icon: ShieldCheck,
                title: "Non-partisan",
                body: "No party line. Just source-backed analysis.",
              },
              {
                icon: CheckCircle2,
                title: "Transparent",
                body: "Every recommendation shows the logic behind it.",
              },
              {
                icon: Sparkles,
                title: "Personalized",
                body: "Your values shape the ranking, not generic punditry.",
              },
            ].map(({ icon: Icon, title, body }) => (
              <div
                key={title}
                className="rounded-[1.5rem] border border-black/5 bg-white/72 p-4 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5"
              >
                <Icon className="size-5 text-cyan-700 dark:text-cyan-300" />
                <h2 className="mt-3 text-sm font-semibold">{title}</h2>
                <p className="mt-1 text-sm text-muted-foreground">{body}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="rounded-[2rem] border border-black/5 bg-[linear-gradient(180deg,rgba(255,255,255,0.86),rgba(244,247,251,0.82))] p-6 shadow-[0_28px_80px_-40px_rgba(15,23,42,0.45)] backdrop-blur-sm dark:border-white/10 dark:bg-[linear-gradient(180deg,rgba(255,255,255,0.08),rgba(255,255,255,0.03))]">
          <div className="space-y-4">
            <div className="rounded-[1.5rem] border border-cyan-500/15 bg-cyan-500/8 p-4 dark:bg-cyan-400/8">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-cyan-800 dark:text-cyan-200">
                How It Works
              </p>
              <ol className="mt-3 space-y-3 text-sm text-muted-foreground">
                <li>Tell Polis what issues matter to you and where you lean.</li>
                <li>Pull in your ballot or build it manually.</li>
                <li>Get research, source links, and alignment analysis you can audit.</li>
              </ol>
            </div>
            <div className="rounded-[1.5rem] border border-black/5 bg-background/70 p-4 dark:border-white/10">
              <p className="text-xs font-semibold uppercase tracking-[0.22em] text-foreground/75">
                Why It Feels Different
              </p>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
                Most voter tools stop at endorsements or bios. Polis is built to
                help you make an actual decision without pretending the analysis
                is magic.
              </p>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
