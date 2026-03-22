"use client";

import { useState } from "react";
import { MoonStar, SunMedium } from "lucide-react";
import { Button } from "@/components/ui/button";

type Theme = "light" | "dark";

function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
  document.documentElement.dataset.theme = theme;
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => {
    if (typeof document !== "undefined") {
      return document.documentElement.classList.contains("dark")
        ? "dark"
        : "light";
    }

    return "light";
  });

  const toggleTheme = () => {
    const nextTheme = theme === "dark" ? "light" : "dark";
    setTheme(nextTheme);
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
      aria-label={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
      title={theme === "dark" ? "Switch to light mode" : "Switch to dark mode"}
    >
      {theme === "dark" ? (
        <SunMedium className="size-4" />
      ) : (
        <MoonStar className="size-4" />
      )}
    </Button>
  );
}
