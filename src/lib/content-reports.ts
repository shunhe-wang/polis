export const CONTENT_REPORT_CATEGORIES = [
  "inaccurate_claim",
  "wrong_party",
  "stale_candidacy",
  "missing_race",
  "unsupported_claim",
  "partisan_bias",
  "other",
] as const;

export type ContentReportCategory = (typeof CONTENT_REPORT_CATEGORIES)[number];

export const CONTENT_REPORT_CATEGORY_LABELS: Record<
  ContentReportCategory,
  string
> = {
  inaccurate_claim: "A stated fact is wrong",
  wrong_party: "Party affiliation is wrong",
  stale_candidacy: "Candidate withdrew or is not running",
  missing_race: "A race or measure is missing",
  unsupported_claim: "A claim has no supporting source",
  partisan_bias: "Content reads as partisan",
  other: "Something else",
};

export const CONTENT_REPORT_SUBJECT_TYPES = [
  "candidate",
  "measure",
  "race",
  "guide",
] as const;

export type ContentReportSubjectType =
  (typeof CONTENT_REPORT_SUBJECT_TYPES)[number];

export const CONTENT_REPORT_DAILY_LIMIT = 10;
export const CONTENT_REPORT_MAX_SUBJECT_LENGTH = 200;
export const CONTENT_REPORT_MAX_DETAILS_LENGTH = 2000;

export interface ContentReportInput {
  category: ContentReportCategory;
  subjectType: ContentReportSubjectType;
  subjectName: string;
  raceName: string | null;
  details: string;
}

function isNonEmptyString(value: unknown, maxLength: number): value is string {
  return (
    typeof value === "string" &&
    value.trim().length > 0 &&
    value.trim().length <= maxLength
  );
}

export function parseContentReportInput(
  body: unknown
): { input: ContentReportInput; error: null } | { input: null; error: string } {
  if (!body || typeof body !== "object") {
    return { input: null, error: "A report body is required" };
  }

  const candidate = body as Record<string, unknown>;

  if (
    !CONTENT_REPORT_CATEGORIES.includes(
      candidate.category as ContentReportCategory
    )
  ) {
    return { input: null, error: "A valid report category is required" };
  }
  if (
    !CONTENT_REPORT_SUBJECT_TYPES.includes(
      candidate.subjectType as ContentReportSubjectType
    )
  ) {
    return { input: null, error: "A valid report subject type is required" };
  }
  if (
    !isNonEmptyString(candidate.subjectName, CONTENT_REPORT_MAX_SUBJECT_LENGTH)
  ) {
    return { input: null, error: "The reported item name is required" };
  }
  if (
    candidate.raceName !== undefined &&
    candidate.raceName !== null &&
    !isNonEmptyString(candidate.raceName, CONTENT_REPORT_MAX_SUBJECT_LENGTH)
  ) {
    return { input: null, error: "The race name is too long" };
  }
  if (!isNonEmptyString(candidate.details, CONTENT_REPORT_MAX_DETAILS_LENGTH)) {
    return {
      input: null,
      error: "A description of the problem is required (2000 characters max)",
    };
  }

  return {
    input: {
      category: candidate.category as ContentReportCategory,
      subjectType: candidate.subjectType as ContentReportSubjectType,
      subjectName: (candidate.subjectName as string).trim(),
      raceName:
        typeof candidate.raceName === "string"
          ? candidate.raceName.trim()
          : null,
      details: (candidate.details as string).trim(),
    },
    error: null,
  };
}
