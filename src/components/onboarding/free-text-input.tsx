"use client";

import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FreeTextInputProps {
  value: string;
  onChange: (value: string) => void;
}

const MAX_LENGTH = 1000;

const PROMPT_VARIANTS = [
  {
    id: "general",
    label: "General",
    prompt: `I'm filling out a voter guide profile and want help writing a short first-person paragraph about what matters to me politically.

Please ask yourself what a real voter would say and write the answer in plain, natural language, not as bullet points.

The paragraph should cover:
- the top issues I care about most
- my rough positions or instincts on those issues
- the values or priorities behind those views
- any types of candidates, parties, or political styles I tend to like or dislike

Keep it honest, specific, and easy to paste into a voter profile form. Aim for about 120-180 words in first person.`,
  },
  {
    id: "first-time",
    label: "First-Time Voter",
    prompt: `Help me write a short first-person voter profile as someone who is not deeply political or is voting for the first time.

Write one natural paragraph, not bullets. It should include:
- the everyday issues I care about most
- the values I want elected officials to reflect
- any broad political instincts I have, even if I am not sure on every issue
- the kinds of candidates or parties I tend to trust or distrust

Keep it grounded, moderate in tone, and easy to paste into a voter guide form. Aim for about 100-150 words.`,
  },
  {
    id: "single-issue",
    label: "Single-Issue",
    prompt: `Help me write a short first-person voter profile for someone who mainly votes based on one or two issues.

Write one paragraph in natural language, not bullets. It should explain:
- the one or two issues I care about most
- why those issues matter so much to me
- the direction I generally want policy to move
- what kinds of candidates I would support or reject because of that

Keep it direct, specific, and easy to paste into a voter guide form. Aim for about 90-140 words.`,
  },
  {
    id: "undecided",
    label: "Undecided",
    prompt: `Help me write a short first-person voter profile for someone who is politically mixed or undecided.

Write one natural paragraph, not bullets. It should include:
- the issues I am still weighing most heavily
- where I seem to lean, even if I am not fully decided
- the values and tradeoffs I care about
- what kinds of candidates, parties, or governing styles I might find appealing or off-putting

Keep it nuanced, practical, and easy to paste into a voter guide form. Aim for about 120-180 words.`,
  },
] as const;

export function FreeTextInput({ value, onChange }: FreeTextInputProps) {
  const [showPromptHelper, setShowPromptHelper] = useState(false);
  const [selectedPromptId, setSelectedPromptId] = useState<
    (typeof PROMPT_VARIANTS)[number]["id"]
  >("general");
  const [copyState, setCopyState] = useState<"idle" | "copied" | "failed">(
    "idle"
  );

  const selectedPrompt = useMemo(
    () =>
      PROMPT_VARIANTS.find((prompt) => prompt.id === selectedPromptId) ??
      PROMPT_VARIANTS[0],
    [selectedPromptId]
  );

  async function handleCopyPrompt() {
    try {
      await navigator.clipboard.writeText(selectedPrompt.prompt);
      setCopyState("copied");
      window.setTimeout(() => setCopyState("idle"), 2000);
    } catch {
      setCopyState("failed");
    }
  }

  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">In Your Own Words</h2>
      <p className="text-sm text-muted-foreground">
        What matters most to you as a voter? This helps us understand your
        priorities beyond the issue ratings.
      </p>

      <div className="mt-6 space-y-2">
        <Label htmlFor="free-text" className="sr-only">
          What matters most to you?
        </Label>
        <Textarea
          id="free-text"
          placeholder="For example: I care most about affordability — rent and groceries are eating my paycheck. I want leaders who will actually do something about housing costs and protect Social Security..."
          value={value}
          onChange={(e) => {
            if (e.target.value.length <= MAX_LENGTH) {
              onChange(e.target.value);
            }
          }}
          rows={6}
          className="resize-none"
        />
        <p className="text-xs text-muted-foreground text-right">
          {value.length}/{MAX_LENGTH}
        </p>
      </div>

      <div className="mt-6 rounded-2xl border border-black/5 bg-background/70 p-4 dark:border-white/10">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
          <div>
            <p className="text-sm font-medium">Not sure what to write?</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Use one of these prompts with ChatGPT or Claude, then paste the
              result back here and edit it however you want.
            </p>
          </div>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setShowPromptHelper((current) => !current)}
          >
            {showPromptHelper ? "Hide Prompts" : "Show Prompt Helper"}
          </Button>
        </div>

        {showPromptHelper && (
          <div className="mt-4 space-y-4">
            <div className="flex flex-wrap gap-2">
              {PROMPT_VARIANTS.map((prompt) => (
                <Button
                  key={prompt.id}
                  type="button"
                  size="sm"
                  variant={
                    selectedPromptId === prompt.id ? "default" : "outline"
                  }
                  onClick={() => {
                    setSelectedPromptId(prompt.id);
                    setCopyState("idle");
                  }}
                >
                  {prompt.label}
                </Button>
              ))}
            </div>

            <div className="rounded-xl border border-black/5 bg-white/70 p-4 dark:border-white/10 dark:bg-white/5">
              <p className="whitespace-pre-line text-sm leading-relaxed">
                {selectedPrompt.prompt}
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-3">
              <Button type="button" size="sm" onClick={handleCopyPrompt}>
                {copyState === "copied"
                  ? "Copied Prompt"
                  : copyState === "failed"
                    ? "Copy Failed"
                    : "Copy Prompt"}
              </Button>
              <p className="text-xs text-muted-foreground">
                Paste the AI-generated answer back into the box above, then trim
                or rewrite anything that does not sound like you.
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
