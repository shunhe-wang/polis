import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  lookupCandidatesWithZai,
  parseBallotReviewDraftFile,
} from "./zai";

vi.mock("./observability", () => ({
  recordAppEvent: () => Promise.resolve(),
}));

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("Z.AI integration", () => {
  beforeEach(() => {
    process.env.ZAI_API_KEY = "test-key";
    delete process.env.ZAI_BASE_URL;
    delete process.env.ZAI_MODEL;
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
    delete process.env.ZAI_API_KEY;
    delete process.env.ZAI_BASE_URL;
    delete process.env.ZAI_MODEL;
  });

  it("uses GLM-5.2 and Z.AI web search for candidate lookup", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      jsonResponse({
        choices: [
          {
            message: {
              content:
                '{"candidates":[{"name":"Jane Doe","party":"Independent"}]}',
            },
          },
        ],
      })
    );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      lookupCandidatesWithZai({
        raceName: "Mayor",
        state: "NY",
        locality: "Albany",
      })
    ).resolves.toEqual([{ name: "Jane Doe", party: "Independent" }]);

    expect(fetchMock).toHaveBeenCalledOnce();
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.z.ai/api/paas/v4/chat/completions"
    );
    const body = JSON.parse(String(init.body));
    expect(body.model).toBe("glm-5.2");
    expect(body.max_tokens).toBe(1800);
    expect(body.tools[0]).toMatchObject({
      type: "web_search",
      web_search: {
        enable: true,
        require_search: true,
        search_engine: "search_pro_jina",
      },
    });
  });

  it("extracts uploaded ballot text with GLM-OCR before GLM-5.2 parsing", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse({ md_results: "Mayor: Jane Doe" }))
      .mockResolvedValueOnce(
        jsonResponse({
          choices: [
            {
              message: {
                content:
                  '{"election":{"name":null,"electionDay":null,"kind":null,"selectedParty":null},"races":[],"measures":[],"confidence":80,"notes":[]}',
              },
            },
          ],
        })
      );
    vi.stubGlobal("fetch", fetchMock);

    await expect(
      parseBallotReviewDraftFile({
        fileName: "sample.pdf",
        mediaType: "application/pdf",
        base64Data: "ZmFrZQ==",
        state: "NY",
      })
    ).resolves.toMatchObject({ confidence: 80 });

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toBe(
      "https://api.z.ai/api/paas/v4/layout_parsing"
    );
    const ocrBody = JSON.parse(
      String((fetchMock.mock.calls[0][1] as RequestInit).body)
    );
    expect(ocrBody).toMatchObject({
      model: "glm-ocr",
      file: "data:application/pdf;base64,ZmFrZQ==",
    });
  });

  it("reports a clear error when the API key is missing", async () => {
    delete process.env.ZAI_API_KEY;
    vi.stubGlobal("fetch", vi.fn());

    await expect(
      lookupCandidatesWithZai({
        raceName: "Mayor",
        state: "NY",
        locality: "",
      })
    ).rejects.toThrow("Z.AI API key is not configured");
  });

  it("preserves upstream status codes for route-level error handling", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn().mockResolvedValue(
        jsonResponse({ message: "Rate limit exceeded" }, 429)
      )
    );

    await expect(
      lookupCandidatesWithZai({
        raceName: "Mayor",
        state: "NY",
        locality: "",
      })
    ).rejects.toMatchObject({ status: 429, name: "ZaiApiError" });
  });
});
