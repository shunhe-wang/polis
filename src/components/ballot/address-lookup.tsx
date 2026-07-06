"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddressLookupValue {
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

interface AddressLookupProps {
  value: AddressLookupValue;
  onChange: (value: AddressLookupValue) => void;
  onLookup: (address: string, electionId?: string, stateHint?: string) => void;
  isLoading: boolean;
}

interface AddressSuggestion {
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

function normalizeStateInput(value: string): string {
  return value.replace(/[^a-z]/gi, "").toUpperCase().slice(0, 2);
}

function normalizeZipCode(value: string): string {
  return value.replace(/\D/g, "").slice(0, 5);
}

export function AddressLookup({
  value,
  onChange,
  onLookup,
  isLoading,
}: AddressLookupProps) {
  const suppressNextLookupRef = useRef(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(false);
  const [autocompleteReady, setAutocompleteReady] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);

  const normalizedState = normalizeStateInput(value.state);
  const normalizedZipCode = normalizeZipCode(value.zipCode);
  const hasValidState = normalizedState.length === 2;
  const hasValidZipCode = normalizedZipCode.length === 5;
  const hasFullAddress =
    value.streetAddress.trim().length > 0 &&
    value.city.trim().length > 0 &&
    hasValidState;
  const canSubmit =
    hasFullAddress ||
    hasValidZipCode ||
    (autocompleteEnabled && searchText.trim().length > 0);

  const buildLookupAddress = () => {
    if (!hasFullAddress) {
      return autocompleteEnabled ? searchText.trim() || normalizedZipCode : normalizedZipCode;
    }

    return [
      value.streetAddress.trim(),
      value.city.trim(),
      normalizedState,
      normalizedZipCode,
    ]
      .filter(Boolean)
      .join(", ");
  };

  useEffect(() => {
    let cancelled = false;

    async function checkAutocomplete() {
      try {
        const response = await fetch("/api/address/autocomplete", {
          cache: "no-store",
        });
        const data = (await response.json()) as { enabled?: boolean };
        if (!cancelled) {
          setAutocompleteEnabled(data.enabled === true);
          setAutocompleteReady(true);
        }
      } catch {
        if (!cancelled) {
          setAutocompleteEnabled(false);
          setAutocompleteReady(true);
        }
      }
    }

    void checkAutocomplete();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!autocompleteEnabled) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSuggesting(false);
      return;
    }

    if (suppressNextLookupRef.current) {
      suppressNextLookupRef.current = false;
      return;
    }

    const query = searchText.trim();
    if (query.length < 3) {
      setSuggestions([]);
      setShowSuggestions(false);
      setIsSuggesting(false);
      return;
    }

    const controller = new AbortController();
    const timeout = window.setTimeout(async () => {
      setIsSuggesting(true);
      try {
        const params = new URLSearchParams({ q: query });
        const response = await fetch(
          `/api/address/autocomplete?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          }
        );
        const data = (await response.json()) as {
          enabled?: boolean;
          suggestions?: AddressSuggestion[];
        };

        setAutocompleteEnabled(data.enabled !== false);
        const nextSuggestions = Array.isArray(data.suggestions)
          ? data.suggestions
          : [];
        setSuggestions(nextSuggestions);
        setShowSuggestions(nextSuggestions.length > 0);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          return;
        }
        setSuggestions([]);
        setShowSuggestions(false);
      } finally {
        setIsSuggesting(false);
      }
    }, 220);

    return () => {
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [autocompleteEnabled, searchText]);

  useEffect(() => {
    return () => {
      if (blurTimeoutRef.current !== null) {
        window.clearTimeout(blurTimeoutRef.current);
      }
    };
  }, []);

  const applySuggestion = (suggestion: AddressSuggestion) => {
    suppressNextLookupRef.current = true;
    setSearchText(suggestion.label);
    onChange({
      streetAddress: suggestion.streetAddress,
      city: suggestion.city,
      state: normalizeStateInput(suggestion.state),
      zipCode: normalizeZipCode(suggestion.zipCode),
    });
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    const address = buildLookupAddress();
    if (address) {
      onLookup(address, undefined, hasValidState ? normalizedState : undefined);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Your Address</p>
        <p className="text-xs text-muted-foreground">
          Fill in your address below. Browser autofill works here, and if live
          suggestions are configured they will appear above the form.
        </p>
      </div>

      {autocompleteReady && autocompleteEnabled && (
        <div className="space-y-2">
          <Label htmlFor="address-search">Address Suggestions</Label>
          <div className="relative">
            <Input
              id="address-search"
              type="text"
              placeholder="Start typing your address"
              value={searchText}
              onChange={(event) => setSearchText(event.target.value)}
              onFocus={() => setShowSuggestions(suggestions.length > 0)}
              onBlur={() => {
                blurTimeoutRef.current = window.setTimeout(() => {
                  setShowSuggestions(false);
                }, 120);
              }}
              autoComplete="street-address"
              disabled={isLoading}
            />
            {showSuggestions && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-20 rounded-xl border border-black/10 bg-background p-1 shadow-xl dark:border-white/10">
                {suggestions.map((suggestion) => (
                  <button
                    key={suggestion.label}
                    type="button"
                    className="flex w-full flex-col rounded-lg px-3 py-2 text-left transition hover:bg-muted"
                    onMouseDown={(event) => {
                      event.preventDefault();
                      applySuggestion(suggestion);
                    }}
                  >
                    <span className="text-sm font-medium">
                      {suggestion.streetAddress || suggestion.label}
                    </span>
                    <span className="text-xs text-muted-foreground">
                      {[suggestion.city, suggestion.state, suggestion.zipCode]
                        .filter(Boolean)
                        .join(", ") || suggestion.label}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <p className="text-xs text-muted-foreground">
            {isSuggesting
              ? "Looking up address suggestions..."
              : "Pick a suggestion to fill the fields below automatically."}
          </p>
        </div>
      )}

      <div className="space-y-2">
        <Label htmlFor="street-address">Street Address</Label>
        <Input
          id="street-address"
          type="text"
          placeholder="1600 Pennsylvania Ave NW"
          value={value.streetAddress}
          onChange={(event) =>
            onChange({
              ...value,
              streetAddress: event.target.value,
            })
          }
          autoComplete="street-address"
          disabled={isLoading}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_92px_120px]">
        <div className="space-y-2">
          <Label htmlFor="city">City</Label>
          <Input
            id="city"
            type="text"
            placeholder="Washington"
            value={value.city}
            onChange={(event) =>
              onChange({
                ...value,
                city: event.target.value,
              })
            }
            autoComplete="address-level2"
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="state">State</Label>
          <Input
            id="state"
            type="text"
            placeholder="DC"
            value={normalizedState}
            onChange={(event) =>
              onChange({
                ...value,
                state: normalizeStateInput(event.target.value),
              })
            }
            autoComplete="address-level1"
            maxLength={2}
            disabled={isLoading}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="zip-code">ZIP Code</Label>
          <Input
            id="zip-code"
            type="text"
            inputMode="numeric"
            placeholder="20500"
            value={normalizedZipCode}
            onChange={(event) =>
              onChange({
                ...value,
                zipCode: normalizeZipCode(event.target.value),
              })
            }
            autoComplete="postal-code"
            pattern="[0-9]{5}"
            maxLength={5}
            disabled={isLoading}
          />
        </div>
      </div>

      {(value.zipCode.length > 0 && !hasValidZipCode) ||
      (value.state.length > 0 && !hasValidState) ? (
        <p className="text-xs text-destructive">
          {!hasValidState && value.state.length > 0
            ? "State must be a 2-letter code."
            : "ZIP code must be exactly 5 digits."}
        </p>
      ) : null}

      <p className="text-xs text-muted-foreground">
        If public election data is incomplete, Polis will show official
        fallback links and let you finish the ballot manually.
      </p>

      <Button type="submit" disabled={!canSubmit || isLoading}>
        {isLoading ? "Looking up your ballot..." : "Find My Ballot"}
      </Button>
    </form>
  );
}
