import Link from "next/link";

export function AppFooter() {
  return (
    <footer className="border-t border-black/5 bg-background/70 px-4 py-8 backdrop-blur-xl dark:border-white/10 dark:bg-background/65 sm:px-6">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-5">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-muted-foreground">
          <Link href="/privacy" className="transition-colors hover:text-foreground">
            Privacy Policy
          </Link>
          <Link href="/terms" className="transition-colors hover:text-foreground">
            Terms of Service
          </Link>
          <Link href="/contact" className="transition-colors hover:text-foreground">
            Contact
          </Link>
        </div>
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          Polis is an informational research tool and is not an official election
          administration website. Candidate positions, ballot language, election
          details, and availability of source information can change. Always
          verify important voting information with official election sources and
          use your own judgment before making decisions.
        </p>
      </div>
    </footer>
  );
}
