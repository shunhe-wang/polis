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
        "grid overflow-hidden transition-all duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] will-change-[grid-template-rows,opacity,transform]",
        open
          ? "mt-4 grid-rows-[1fr] translate-y-0 opacity-100"
          : "mt-0 grid-rows-[0fr] -translate-y-1 opacity-0",
        className
      )}
    >
      <div className="min-h-0">{children}</div>
    </div>
  );
}
