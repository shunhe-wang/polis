import Link from "next/link";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function ContactPage() {
  return (
    <main className="flex flex-1 flex-col items-center px-4 py-12 sm:px-6 sm:py-20">
      <div className="mx-auto w-full max-w-3xl space-y-6">
        <div className="max-w-2xl">
          <p className="text-xs font-semibold uppercase tracking-[0.28em] text-cyan-800 dark:text-cyan-200">
            Contact
          </p>
          <h1 className="mt-3 text-4xl font-semibold tracking-tight sm:text-5xl">
            Get in touch
          </h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground sm:text-lg">
            Questions, feedback, partnership ideas, or support requests are all
            welcome. The simplest way to reach Polis is by email.
          </p>
        </div>

        <Card className="border-black/5 bg-white/72 shadow-[0_18px_50px_-38px_rgba(15,23,42,0.35)] backdrop-blur-sm dark:border-white/10 dark:bg-white/5">
          <CardContent className="space-y-4 pt-6">
            <p className="text-sm text-muted-foreground">
              Email us anytime at
            </p>
            <a
              href="mailto:contact@getpolis.vote"
              className="inline-block text-2xl font-semibold tracking-tight text-foreground underline decoration-cyan-600/40 underline-offset-4 transition-colors hover:text-cyan-800 dark:hover:text-cyan-200"
            >
              contact@getpolis.vote
            </a>
            <p className="text-sm text-muted-foreground">
              We&apos;ll do our best to respond as quickly as we can.
            </p>
          </CardContent>
        </Card>

        <div className="flex flex-wrap gap-3">
          <Link href="/privacy">
            <Button variant="outline" className="rounded-full">
              Privacy Policy
            </Button>
          </Link>
          <Link href="/terms">
            <Button variant="outline" className="rounded-full">
              Terms of Service
            </Button>
          </Link>
        </div>
      </div>
    </main>
  );
}
