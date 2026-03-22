"use client";

import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";

interface FreeTextInputProps {
  value: string;
  onChange: (value: string) => void;
}

const MAX_LENGTH = 1000;

export function FreeTextInput({ value, onChange }: FreeTextInputProps) {
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
    </div>
  );
}
