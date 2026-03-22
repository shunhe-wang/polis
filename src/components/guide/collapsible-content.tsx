"use client";

import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function CollapsibleContent({
  open,
  className,
  children,
}: {
  open: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden transition-all duration-300 ease-out",
        open
          ? "mt-4 grid-rows-[1fr] opacity-100"
          : "mt-0 grid-rows-[0fr] opacity-0",
        className
      )}
    >
      <div className="min-h-0">{children}</div>
    </div>
  );
}
