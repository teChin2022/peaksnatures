import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { logClientEvent } from "@/lib/history-log-client";

let fetchMock: ReturnType<typeof vi.fn>;

const params = {
  entity_type: "homestay",
  entity_id: "homestay-1",
  event_type: "homestay_updated",
};

beforeEach(() => {
  fetchMock = vi.fn(() => Promise.resolve({ ok: true } as Response));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("logClientEvent", () => {
  it("posts the event to the history-log endpoint", async () => {
    await logClientEvent({ ...params, homestay_id: "homestay-1", actor_type: "host", data: { field: "name" } });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/history-log");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(init.body as string)).toEqual({
      homestay_id: "homestay-1",
      entity_type: "homestay",
      entity_id: "homestay-1",
      event_type: "homestay_updated",
      actor_type: "host",
      data: { field: "name" },
    });
  });

  it("resolves with nothing so callers can await it before signing out", async () => {
    await expect(logClientEvent(params)).resolves.toBeUndefined();
  });

  it("stays silent when the request fails, so logging never blocks the user", async () => {
    fetchMock.mockRejectedValue(new TypeError("offline"));
    await expect(logClientEvent(params)).resolves.toBeUndefined();
  });
});
