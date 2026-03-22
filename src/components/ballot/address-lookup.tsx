"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

interface AddressLookupProps {
  onLookup: (address: string) => void;
  isLoading: boolean;
}

export function AddressLookup({ onLookup, isLoading }: AddressLookupProps) {
  const [address, setAddress] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (address.trim()) {
      onLookup(address.trim());
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-2">
        <Label htmlFor="address">Your Address or Zip Code</Label>
        <p className="text-xs text-muted-foreground">
          Enter your full address or just a zip code to find your voting
          districts and the candidates on your ballot. It stays in your
          browser unless you sign in, in which case it can be saved to your
          account so you can resume later.
        </p>
        <Input
          id="address"
          type="text"
          placeholder="e.g. 1600 Pennsylvania Ave, Washington DC 20500 or just a zip code"
          value={address}
          onChange={(e) => setAddress(e.target.value)}
          disabled={isLoading}
        />
      </div>
      <Button type="submit" disabled={!address.trim() || isLoading}>
        {isLoading ? "Looking up your ballot..." : "Find My Ballot"}
      </Button>
    </form>
  );
}
