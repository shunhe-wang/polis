"use client";

import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Label } from "@/components/ui/label";
import {
  type PoliticalIdentity,
  POLITICAL_IDENTITIES,
  IDENTITY_LABELS,
} from "@/lib/types";

interface IdentitySelectorProps {
  value: PoliticalIdentity | null;
  onChange: (value: PoliticalIdentity | null) => void;
}

export function IdentitySelector({ value, onChange }: IdentitySelectorProps) {
  return (
    <div className="space-y-2">
      <h2 className="text-xl font-semibold">Political Identity</h2>
      <p className="text-sm text-muted-foreground">
        Optional — this helps calibrate our analysis, but your issue ratings
        matter more. We never share this.
      </p>

      <RadioGroup
        value={value ?? ""}
        onValueChange={(v) => onChange(v as PoliticalIdentity)}
        className="mt-6 space-y-3"
      >
        {POLITICAL_IDENTITIES.map((identity) => (
          <div key={identity} className="flex items-center space-x-3">
            <RadioGroupItem value={identity} id={identity} />
            <Label htmlFor={identity} className="cursor-pointer text-sm">
              {IDENTITY_LABELS[identity]}
            </Label>
          </div>
        ))}
      </RadioGroup>

      {value && value !== "prefer_not_to_say" && (
        <button
          type="button"
          onClick={() => onChange(null)}
          className="mt-3 text-xs text-muted-foreground underline underline-offset-2 hover:text-foreground"
        >
          Clear selection
        </button>
      )}
    </div>
  );
}
