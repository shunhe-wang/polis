import { describe, expect, it } from "vitest";
import {
  CONTENT_REPORT_MAX_DETAILS_LENGTH,
  parseContentReportInput,
} from "./content-reports";

const validBody = {
  category: "wrong_party",
  subjectType: "candidate",
  subjectName: "Jane Example",
  raceName: "U.S. Senate",
  details: "The card lists the wrong party for this candidate.",
};

describe("parseContentReportInput", () => {
  it("accepts a complete report and trims text fields", () => {
    const result = parseContentReportInput({
      ...validBody,
      subjectName: "  Jane Example  ",
      details: "  Wrong party shown.  ",
    });

    expect(result.error).toBeNull();
    expect(result.input).toMatchObject({
      category: "wrong_party",
      subjectType: "candidate",
      subjectName: "Jane Example",
      raceName: "U.S. Senate",
      details: "Wrong party shown.",
    });
  });

  it("accepts a report without a race name", () => {
    const body: Record<string, unknown> = { ...validBody };
    delete body.raceName;
    const result = parseContentReportInput(body);

    expect(result.error).toBeNull();
    expect(result.input?.raceName).toBeNull();
  });

  it("rejects a missing body", () => {
    expect(parseContentReportInput(null).error).toBeTruthy();
    expect(parseContentReportInput("report").error).toBeTruthy();
  });

  it("rejects an unknown category", () => {
    const result = parseContentReportInput({
      ...validBody,
      category: "spam",
    });
    expect(result.error).toContain("category");
  });

  it("rejects an unknown subject type", () => {
    const result = parseContentReportInput({
      ...validBody,
      subjectType: "poll",
    });
    expect(result.error).toContain("subject type");
  });

  it("rejects empty or oversized details", () => {
    expect(
      parseContentReportInput({ ...validBody, details: "   " }).error
    ).toBeTruthy();
    expect(
      parseContentReportInput({
        ...validBody,
        details: "x".repeat(CONTENT_REPORT_MAX_DETAILS_LENGTH + 1),
      }).error
    ).toBeTruthy();
  });

  it("rejects an oversized subject name", () => {
    const result = parseContentReportInput({
      ...validBody,
      subjectName: "x".repeat(201),
    });
    expect(result.error).toBeTruthy();
  });
});
