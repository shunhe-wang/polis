import { afterEach, describe, expect, it, vi } from "vitest";
import {
  buildAlertPayload,
  deliverAlertWebhook,
  shouldDeliverAlert,
} from "./alerts";

describe("shouldDeliverAlert", () => {
  it("delivers errors regardless of threshold", () => {
    expect(shouldDeliverAlert("error", undefined)).toBe(true);
    expect(shouldDeliverAlert("error", "warning")).toBe(true);
  });

  it("delivers warnings only when the threshold is lowered", () => {
    expect(shouldDeliverAlert("warning", undefined)).toBe(false);
    expect(shouldDeliverAlert("warning", "warning")).toBe(true);
  });

  it("never delivers info events", () => {
    expect(shouldDeliverAlert("info", "warning")).toBe(false);
    expect(shouldDeliverAlert(undefined, "warning")).toBe(false);
  });
});

describe("buildAlertPayload", () => {
  it("produces a Slack-compatible text summary", () => {
    const payload = buildAlertPayload({
      category: "billing",
      event: "app_store_transaction_failed",
      severity: "error",
      route: "/api/storekit/transactions",
      details: { message: "boom" },
    });

    expect(payload.text).toBe(
      "[polis error] billing/app_store_transaction_failed (/api/storekit/transactions)"
    );
    expect(payload.details).toEqual({ message: "boom" });
  });
});

describe("deliverAlertWebhook", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("does nothing when no webhook is configured", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ALERT_WEBHOOK_URL", "");

    await deliverAlertWebhook({
      category: "billing",
      event: "x",
      severity: "error",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("posts qualifying events to the configured webhook", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response("ok"));
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/alert");

    await deliverAlertWebhook({
      category: "provider",
      event: "zai_request_failed",
      severity: "error",
    });

    expect(fetchMock).toHaveBeenCalledWith(
      "https://hooks.example/alert",
      expect.objectContaining({ method: "POST" })
    );
  });

  it("swallows webhook delivery failures", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")));
    vi.stubEnv("ALERT_WEBHOOK_URL", "https://hooks.example/alert");

    await expect(
      deliverAlertWebhook({ category: "x", event: "y", severity: "error" })
    ).resolves.toBeUndefined();
  });
});
