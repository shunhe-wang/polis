"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddressLookupProps {
  onLookup: (address: string) => void;
  isLoading: boolean;
}

interface AddressSuggestion {
  label: string;
  streetAddress: string;
  city: string;
  state: string;
  zipCode: string;
}

export function AddressLookup({ onLookup, isLoading }: AddressLookupProps) {
  const suppressNextLookupRef = useRef(false);
  const blurTimeoutRef = useRef<number | null>(null);
  const [searchText, setSearchText] = useState("");
  const [streetAddress, setStreetAddress] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [isSuggesting, setIsSuggesting] = useState(false);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [autocompleteEnabled, setAutocompleteEnabled] = useState(true);

  const hasFullAddress =
    streetAddress.trim().length > 0 &&
    city.trim().length > 0 &&
    state.trim().length > 0;
  const canSubmit =
    hasFullAddress ||
    zipCode.trim().length > 0 ||
    searchText.trim().length > 0;

  const buildLookupAddress = () => {
    if (!hasFullAddress) {
      return searchText.trim() || zipCode.trim();
    }

    return [
      streetAddress.trim(),
      city.trim(),
      state.trim().toUpperCase(),
      zipCode.trim(),
    ]
      .filter(Boolean)
      .join(", ");
  };

  useEffect(() => {
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
        const response = await fetch(`/api/address/autocomplete?${params.toString()}`, {
          signal: controller.signal,
          cache: "no-store",
        });
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
  }, [searchText]);

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
    setStreetAddress(suggestion.streetAddress);
    setCity(suggestion.city);
    setState(suggestion.state);
    setZipCode(suggestion.zipCode);
    setSuggestions([]);
    setShowSuggestions(false);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const address = buildLookupAddress();
    if (address) {
      onLookup(address);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <p className="text-sm font-medium">Your Address</p>
        <p className="text-xs text-muted-foreground">
          Start with the autocomplete field for live suggestions, or fill the
          structured fields manually. Browser autofill still works too, and you
          can use only a ZIP code when you want a quick lookup.
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="address-search">Search Address</Label>
        <div className="relative">
          <Input
            id="address-search"
            type="text"
            placeholder="Start typing your address"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
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
                  <span className="text-sm font-medium">{suggestion.streetAddress || suggestion.label}</span>
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
          {autocompleteEnabled
            ? isSuggesting
              ? "Looking up address suggestions..."
              : "Pick a suggestion to fill the fields below automatically."
            : "Address suggestions are not configured yet, so you can keep filling the form manually."}
        </p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="street-address">Street Address</Label>
        <Input
          id="street-address"
          type="text"
          placeholder="1600 Pennsylvania Ave NW"
          value={streetAddress}
          onChange={(e) => setStreetAddress(e.target.value)}
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
            value={city}
            onChange={(e) => setCity(e.target.value)}
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
            value={state}
            onChange={(e) => setState(e.target.value)}
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
            value={zipCode}
            onChange={(e) => setZipCode(e.target.value)}
            autoComplete="postal-code"
            disabled={isLoading}
          />
        </div>
      </div>
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
