"use client";

import { MoonStar, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";

function applyTheme(theme: "light" | "dark") {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const toggleTheme = () => {
    const theme = document.documentElement.classList.contains("dark")
      ? "dark"
      : "light";
    const nextTheme = theme === "dark" ? "light" : "dark";
    applyTheme(nextTheme);
    window.localStorage.setItem("theme", nextTheme);
  };

  return (
    <Button
      type="button"
      variant="outline"
      size="icon-sm"
      onClick={toggleTheme}
      suppressHydrationWarning
      className="rounded-full border-white/20 bg-white/65 shadow-sm backdrop-blur-sm hover:bg-white dark:border-white/10 dark:bg-white/5 dark:hover:bg-white/10"
      aria-label="Toggle theme"
      title="Toggle theme"
    >
      <SunMedium className="hidden size-4 dark:block" />
      <MoonStar className="size-4 dark:hidden" />
    </Button>
  );
}
