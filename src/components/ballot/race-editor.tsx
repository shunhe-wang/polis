"use client";

import { useState, useRef } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import type { Race, Candidate } from "@/lib/types";
import { formatPartyInline } from "@/lib/party-format";
import { fetchWithAiConsent } from "@/lib/ai-consent-client";

interface RaceEditorProps {
  races: Race[];
  onRacesChange: (races: Race[]) => void;
  state?: string | null;
  locality?: string | null;
  address?: string | null;
  electionId?: string | null;
  canLookupCandidates: boolean;
}

let idCounter = 1000;
function genId(prefix: string): string {
  idCounter++;
  return `${prefix}-${idCounter}`;
}

function inferLevel(name: string): Race["level"] {
  const lower = name.toLowerCase();
  if (
    lower.includes("u.s.") ||
    lower.includes("us ") ||
    lower.includes("united states") ||
    lower.includes("president")
  )
    return "federal";
  if (
    lower.includes("state") ||
    lower.includes("governor") ||
    lower.includes("attorney general") ||
    lower.includes("secretary of state")
  )
    return "state";
  return "local";
}

interface RaceTemplate {
  label: string;
  name: string;
  level: Race["level"];
  needsDistrict?: boolean;
}

const RACE_TEMPLATES: RaceTemplate[] = [
  { label: "US Senate", name: "US Senate", level: "federal" },
  {
    label: "US House",
    name: "US House",
    level: "federal",
    needsDistrict: true,
  },
  { label: "Governor", name: "Governor", level: "state" },
  { label: "Attorney General", name: "Attorney General", level: "state" },
  { label: "Secretary of State", name: "Secretary of State", level: "state" },
  {
    label: "State Senate",
    name: "State Senate",
    level: "state",
    needsDistrict: true,
  },
  {
    label: "State House",
    name: "State House",
    level: "state",
    needsDistrict: true,
  },
  { label: "Mayor", name: "Mayor", level: "local" },
  {
    label: "City Council",
    name: "City Council",
    level: "local",
    needsDistrict: true,
  },
  {
    label: "School Board",
    name: "School Board",
    level: "local",
    needsDistrict: true,
  },
];

function getRaceLookupRequirement(
  raceName: string,
  state: string | null | undefined,
  locality: string | null | undefined
): string | null {
  if (!state) {
    return "Add your address first so Polis knows which state and ballot context to search.";
  }

  const lower = raceName.toLowerCase();
  const hasQualifier =
    raceName.includes(" - ") ||
    /\bdistrict\b|\bward\b|\bprecinct\b|\bcounty\b|\bcity\b|\btown\b|\bborough\b/i.test(
      raceName
    );

  if (
    lower.includes("us house") ||
    lower.includes("state senate") ||
    lower.includes("state house") ||
    lower.includes("city council") ||
    lower.includes("school board") ||
    lower.includes("mayor")
  ) {
    return hasQualifier
      ? null
      : "Add the district, city, or locality before looking up candidates for this race.";
  }

  if (lower.includes("mayor") && !hasQualifier && !locality) {
    return "Add the city or locality before looking up candidates for this race.";
  }

  return null;
}

export function RaceEditor({
  races,
  onRacesChange,
  state,
  locality,
  address,
  electionId,
  canLookupCandidates,
}: RaceEditorProps) {
  const [showAddRace, setShowAddRace] = useState(false);
  const [newRaceName, setNewRaceName] = useState("");
  const [lookingUp, setLookingUp] = useState<string | null>(null);
  const [lookupMessage, setLookupMessage] = useState<string | null>(null);
  const [districtInput, setDistrictInput] = useState("");
  const [pendingTemplate, setPendingTemplate] = useState<RaceTemplate | null>(
    null
  );

  // Use a ref so async callbacks always see the latest races
  const racesRef = useRef(races);
  racesRef.current = races;

  const lookUpCandidates = async (raceId: string, raceName: string) => {
    const requirement = getRaceLookupRequirement(raceName, state, locality);
    if (requirement) {
      setLookupMessage(requirement);
      return;
    }

    if (!canLookupCandidates) {
      setLookupMessage(
        "Sign in with a trusted account to use automatic candidate lookup. You can still add candidates manually."
      );
      return;
    }

    setLookingUp(raceId);
    setLookupMessage(null);
    try {
      const res = await fetchWithAiConsent("/api/candidates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          raceName,
          state: state ?? "",
          locality: locality ?? "",
          address: address ?? "",
          electionId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLookupMessage(
          typeof data?.error === "string"
            ? data.error
            : "Candidate lookup is unavailable right now."
        );
        return;
      }

      if (data.candidates && data.candidates.length > 0) {
        onRacesChange(
          racesRef.current.map((race) => {
            if (race.id !== raceId) return race;

            const existingKeys = new Set(
              race.candidates.map((candidate) =>
                `${candidate.name.toLowerCase()}::${candidate.party ?? ""}`
              )
            );

            const newCandidates: Candidate[] = data.candidates
              .filter((c: { name: string; party: string | null }) => {
                const key = `${c.name.toLowerCase()}::${c.party ?? ""}`;
                return !existingKeys.has(key);
              })
              .map((c: { name: string; party: string | null }) => ({
                id: genId("candidate"),
                name: c.name,
                party: c.party,
              }));

            if (newCandidates.length === 0) {
              setLookupMessage("No new candidates found for that race.");
              return race;
            }

            return {
              ...race,
              candidates: [...race.candidates, ...newCandidates],
            };
          })
        );
      } else {
        setLookupMessage("No candidates found. You can add them manually.");
      }
    } catch {
      setLookupMessage(
        "Candidate lookup failed. You can still add candidates manually."
      );
    } finally {
      setLookingUp(null);
    }
  };

  const addRaceByName = (
    raceName: string,
    level: Race["level"] = inferLevel(raceName)
  ) => {
    const raceId = genId("race");
    const newRace: Race = {
      id: raceId,
      name: raceName,
      level,
      candidates: [],
    };
    const updatedRaces = [...races, newRace];
    racesRef.current = updatedRaces;
    onRacesChange(updatedRaces);
  };

  const addRace = () => {
    if (!newRaceName.trim()) return;
    addRaceByName(newRaceName.trim());
    setNewRaceName("");
    setShowAddRace(false);
  };

  const handleTemplateClick = (template: RaceTemplate) => {
    if (template.needsDistrict) {
      setPendingTemplate(template);
      setDistrictInput("");
    } else {
      const suffix = state ? ` - ${state}` : "";
      addRaceByName(`${template.name}${suffix}`, template.level);
    }
  };

  const confirmTemplate = () => {
    if (!pendingTemplate) return;
    const suffix = districtInput.trim()
      ? ` - ${districtInput.trim()}`
      : state
        ? ` - ${state}`
        : "";
    addRaceByName(`${pendingTemplate.name}${suffix}`, pendingTemplate.level);
    setPendingTemplate(null);
    setDistrictInput("");
  };

  const removeRace = (raceId: string) => {
    onRacesChange(races.filter((r) => r.id !== raceId));
  };

  const addCandidate = (raceId: string, name: string, party: string) => {
    onRacesChange(
      races.map((race) => {
        if (race.id !== raceId) return race;
        const newCandidate: Candidate = {
          id: genId("candidate"),
          name: name.trim(),
          party: party.trim() || null,
        };
        return { ...race, candidates: [...race.candidates, newCandidate] };
      })
    );
  };

  const removeCandidate = (raceId: string, candidateId: string) => {
    onRacesChange(
      races.map((race) => {
        if (race.id !== raceId) return race;
        return {
          ...race,
          candidates: race.candidates.filter((c) => c.id !== candidateId),
        };
      })
    );
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium">
          {races.length === 0 ? "No races found" : `${races.length} race${races.length === 1 ? "" : "s"} on your ballot`}
        </h3>
        <Button
          variant="outline"
          size="sm"
          onClick={() => setShowAddRace(!showAddRace)}
        >
          {showAddRace ? "Cancel" : "Add Race"}
        </Button>
      </div>

      {showAddRace && (
        <div className="space-y-3">
          {/* Quick-add template buttons */}
          <div className="flex flex-wrap gap-2">
            {RACE_TEMPLATES.map((t) => (
              <Button
                key={t.label}
                variant="outline"
                size="sm"
                className="text-xs"
                disabled={!state}
                onClick={() => handleTemplateClick(t)}
              >
                {t.label}
              </Button>
            ))}
          </div>
          {!state && (
            <p className="text-xs text-muted-foreground">
              Look up your address first to unlock race shortcuts tied to a
              specific state or locality.
            </p>
          )}

          {/* District input for templates that need it */}
          {pendingTemplate && (
            <div className="flex gap-2">
              <Input
                placeholder={`District or location (e.g. ${state ?? "MI"} District 7)`}
                value={districtInput}
                onChange={(e) => setDistrictInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && confirmTemplate()}
                autoFocus
              />
              <Button onClick={confirmTemplate}>Add</Button>
              <Button
                variant="ghost"
                onClick={() => setPendingTemplate(null)}
              >
                Cancel
              </Button>
            </div>
          )}

          {/* Custom race name input */}
          <div className="flex gap-2">
            <Input
              placeholder="Or type a custom race name..."
              value={newRaceName}
              onChange={(e) => setNewRaceName(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addRace()}
            />
            <Button onClick={addRace} disabled={!newRaceName.trim()}>
              Add
            </Button>
          </div>
        </div>
      )}

      {races.map((race) => (
        <RaceCard
          key={race.id}
          race={race}
          isLookingUp={lookingUp === race.id}
          onRemoveRace={() => removeRace(race.id)}
          onAddCandidate={(name, party) =>
            addCandidate(race.id, name, party)
          }
          onRemoveCandidate={(candidateId) =>
            removeCandidate(race.id, candidateId)
          }
          onLookUpCandidates={() =>
            lookUpCandidates(race.id, race.name)
          }
          canLookUpCandidates={canLookupCandidates}
          lookupRequirement={getRaceLookupRequirement(race.name, state, locality)}
        />
      ))}

      {lookupMessage && (
        <p className="text-xs text-muted-foreground">{lookupMessage}</p>
      )}
    </div>
  );
}

// ─── Individual Race Card ────────────────────────────────────────

interface RaceCardProps {
  race: Race;
  isLookingUp: boolean;
  onRemoveRace: () => void;
  onAddCandidate: (name: string, party: string) => void;
  onRemoveCandidate: (candidateId: string) => void;
  onLookUpCandidates: () => void;
  canLookUpCandidates: boolean;
  lookupRequirement: string | null;
}

function RaceCard({
  race,
  isLookingUp,
  onRemoveRace,
  onAddCandidate,
  onRemoveCandidate,
  onLookUpCandidates,
  canLookUpCandidates,
  lookupRequirement,
}: RaceCardProps) {
  const [showAdd, setShowAdd] = useState(false);
  const [candidateName, setCandidateName] = useState("");
  const [candidateParty, setCandidateParty] = useState("");

  const handleAdd = () => {
    if (!candidateName.trim()) return;
    onAddCandidate(candidateName, candidateParty);
    setCandidateName("");
    setCandidateParty("");
    setShowAdd(false);
  };

  const levelColors: Record<Race["level"], string> = {
    federal: "bg-blue-100 text-blue-800",
    state: "bg-purple-100 text-purple-800",
    local: "bg-green-100 text-green-800",
  };

  return (
    <Card>
      <CardContent className="pt-4">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-2">
            <h4 className="text-sm font-semibold">{race.name}</h4>
            <Badge variant="secondary" className={levelColors[race.level]}>
              {race.level}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={onRemoveRace}
            className="text-muted-foreground hover:text-destructive"
          >
            Remove
          </Button>
        </div>

        {race.candidates.length > 0 && (
          <>
            <Separator className="my-3" />
            <ul className="space-y-2">
              {race.candidates.map((candidate) => (
                <li
                  key={candidate.id}
                  className="flex items-center justify-between text-sm"
                >
                  <span>
                    {candidate.name}
                    {candidate.party && (
                      <span className="ml-1 text-muted-foreground">
                        {formatPartyInline(candidate.party)}
                      </span>
                    )}
                  </span>
                  <button
                    onClick={() => onRemoveCandidate(candidate.id)}
                    className="text-xs text-muted-foreground underline underline-offset-2 hover:text-destructive"
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </>
        )}

        {isLookingUp && (
          <p className="mt-3 text-xs text-muted-foreground animate-pulse">
            Looking up candidates...
          </p>
        )}

        <div className="mt-3">
          {showAdd ? (
            <div className="space-y-2">
              <div className="flex gap-2">
                <Input
                  placeholder="Candidate name"
                  value={candidateName}
                  onChange={(e) => setCandidateName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="flex-1"
                />
                <Input
                  placeholder="Party (optional)"
                  value={candidateParty}
                  onChange={(e) => setCandidateParty(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                  className="w-32"
                />
              </div>
              <div className="flex gap-2">
                <Button
                  size="sm"
                  onClick={handleAdd}
                  disabled={!candidateName.trim()}
                >
                  Add Candidate
                </Button>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => setShowAdd(false)}
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex gap-2">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAdd(true)}
                className="text-xs"
              >
                + Add Candidate
              </Button>
              {!isLookingUp && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={onLookUpCandidates}
                  className="text-xs"
                  disabled={!canLookUpCandidates || Boolean(lookupRequirement)}
                >
                  Look Up Candidates
                </Button>
              )}
            </div>
          )}
        </div>
        {(lookupRequirement || !canLookUpCandidates) && (
          <p className="mt-2 text-xs text-muted-foreground">
            {lookupRequirement ??
              "Sign in with a trusted account before using automatic candidate lookup."}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
