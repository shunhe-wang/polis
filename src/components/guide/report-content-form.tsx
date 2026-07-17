"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  CONTENT_REPORT_CATEGORIES,
  CONTENT_REPORT_CATEGORY_LABELS,
  CONTENT_REPORT_MAX_DETAILS_LENGTH,
  type ContentReportCategory,
  type ContentReportSubjectType,
} from "@/lib/content-reports";

interface ReportContentFormProps {
  subjectType: ContentReportSubjectType;
  subjectName: string;
  raceName?: string;
}

type SubmitState = "idle" | "submitting" | "success" | "error";

export function ReportContentForm({
  subjectType,
  subjectName,
  raceName,
}: ReportContentFormProps) {
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<ContentReportCategory>(
    "inaccurate_claim"
  );
  const [details, setDetails] = useState("");
  const [state, setState] = useState<SubmitState>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function submitReport() {
    if (details.trim().length === 0) {
      setErrorMessage("Please describe what is wrong.");
      setState("error");
      return;
    }

    setState("submitting");
    setErrorMessage(null);
    try {
      const response = await fetch("/api/reports", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          category,
          subjectType,
          subjectName,
          raceName: raceName ?? null,
          details,
        }),
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setErrorMessage(
          response.status === 401
            ? "Sign in to report a problem."
            : (payload?.error ?? "Could not submit the report.")
        );
        setState("error");
        return;
      }
      setState("success");
    } catch {
      setErrorMessage("Could not submit the report.");
      setState("error");
    }
  }

  if (state === "success") {
    return (
      <p className="mt-2 text-xs text-muted-foreground" role="status">
        Thanks. Your report was received and will be reviewed by a person.
      </p>
    );
  }

  return (
    <div className="mt-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => setOpen(!open)}
        className="h-7 rounded-full px-2 text-xs text-muted-foreground"
        aria-expanded={open}
      >
        {open ? "Cancel report" : "Report a problem"}
      </Button>

      {open && (
        <div className="mt-2 space-y-2 rounded-2xl border border-black/5 bg-background/75 p-3 dark:border-white/10">
          <label className="block text-xs font-medium">
            What is wrong?
            <select
              value={category}
              onChange={(event) =>
                setCategory(event.target.value as ContentReportCategory)
              }
              className="mt-1 block w-full rounded-md border border-input bg-transparent px-2 py-1.5 text-sm"
            >
              {CONTENT_REPORT_CATEGORIES.map((value) => (
                <option key={value} value={value}>
                  {CONTENT_REPORT_CATEGORY_LABELS[value]}
                </option>
              ))}
            </select>
          </label>

          <label className="block text-xs font-medium">
            Details
            <Textarea
              value={details}
              onChange={(event) => setDetails(event.target.value)}
              maxLength={CONTENT_REPORT_MAX_DETAILS_LENGTH}
              placeholder="Tell us what is incorrect and, if you can, link a source."
              className="mt-1 min-h-20 text-sm"
            />
          </label>

          {errorMessage && (
            <p className="text-xs text-red-600" role="alert">
              {errorMessage}
            </p>
          )}

          <Button
            size="sm"
            onClick={submitReport}
            disabled={state === "submitting"}
            className="rounded-full text-xs"
          >
            {state === "submitting" ? "Submitting…" : "Submit report"}
          </Button>
        </div>
      )}
    </div>
  );
}
