import { describe, expect, it } from "vitest";
import {
  buildCandidateDossierKey,
  buildMeasureDossierKey,
} from "@/lib/research-dossiers";

describe("research dossier keys", () => {
  it("normalizes equivalent candidate names and race labels", () => {
    const first = buildCandidateDossierKey(
      { id: "1", name: "Jane Doe", party: "Independent" },
      { id: "race-1", name: "Mayor", level: "local", candidates: [] },
      "VA"
    );
    const second = buildCandidateDossierKey(
      { id: "2", name: "  jane doe  ", party: "Independent" },
      { id: "race-2", name: "Mayor!", level: "local", candidates: [] },
      "va"
    );

    expect(first).toBe(second);
  });

  it("produces different keys for different measures", () => {
    const first = buildMeasureDossierKey(
      {
        id: "m1",
        title: "Amendment 1",
        description: "Transit funding",
        type: "amendment",
      },
      "VA"
    );
    const second = buildMeasureDossierKey(
      {
        id: "m2",
        title: "Amendment 2",
        description: "School funding",
        type: "amendment",
      },
      "VA"
    );

    expect(first).not.toBe(second);
  });
});
