import Link from "next/link";
import { ThemeToggle } from "@/components/layout/theme-toggle";

export function AppHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-black/5 bg-background/70 backdrop-blur-xl dark:border-white/10 dark:bg-background/65">
      <div className="mx-auto flex w-full max-w-6xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,rgba(14,116,144,0.95),rgba(15,23,42,0.96))] text-sm font-semibold text-white shadow-lg shadow-cyan-950/20">
            P
          </div>
          <div>
            <p className="text-sm font-semibold tracking-[0.2em] text-foreground/90 uppercase">
              Polis
            </p>
            <p className="text-xs text-muted-foreground">
              Voter guide, aligned to your values
            </p>
          </div>
        </Link>
        <ThemeToggle />
      </div>
    </header>
  );
}
