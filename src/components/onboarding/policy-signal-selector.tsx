"use client";

import {
  POLICY_SIGNALS,
  POLICY_SIGNAL_CHOICES,
  POLICY_SIGNAL_CHOICE_LABELS,
  POLICY_SIGNAL_LABELS,
  type PolicySignal,
  type PolicySignals,
} from "@/lib/types";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";

interface PolicySignalSelectorProps {
  value: PolicySignals;
  onChange: <K extends PolicySignal>(
    signal: K,
    nextValue: PolicySignals[K]
  ) => void;
}

export function PolicySignalSelector({
  value,
  onChange,
}: PolicySignalSelectorProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Policy Leanings</h2>
      <p className="text-sm text-muted-foreground">
        Optional, but useful. This captures directional preferences that
        simple importance ratings miss.
      </p>

      <div className="mt-6 space-y-6">
        {POLICY_SIGNALS.map((signal) => (
          <div
            key={signal}
            className="space-y-3 rounded-xl border bg-muted/20 p-4"
          >
            <div>
              <h3 className="text-sm font-medium">
                {POLICY_SIGNAL_LABELS[signal]}
              </h3>
            </div>

            <RadioGroup
              value={value[signal] ?? ""}
              onValueChange={(nextValue) =>
                onChange(
                  signal,
                  (nextValue || null) as PolicySignals[typeof signal]
                )
              }
              className="space-y-2"
            >
              {POLICY_SIGNAL_CHOICES[signal].map((choice) => (
                <div
                  key={choice}
                  className="flex items-start gap-3 rounded-lg border bg-background px-3 py-2"
                >
                  <RadioGroupItem value={choice} id={`${signal}-${choice}`} />
                  <Label
                    htmlFor={`${signal}-${choice}`}
                    className="cursor-pointer text-sm leading-relaxed"
                  >
                    {getPolicySignalChoiceLabel(signal, choice)}
                  </Label>
                </div>
              ))}
            </RadioGroup>

            {value[signal] && (
              <button
                type="button"
                onClick={() => onChange(signal, null)}
                className="text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
              >
                Clear selection
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function getPolicySignalChoiceLabel(
  signal: PolicySignal,
  choice: string
): string {
  return (
    POLICY_SIGNAL_CHOICE_LABELS[signal][
      choice as keyof (typeof POLICY_SIGNAL_CHOICE_LABELS)[typeof signal]
    ] ?? choice
  );
}
