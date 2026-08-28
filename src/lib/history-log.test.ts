import { beforeEach, describe, expect, it, vi } from "vitest";
import { EventType, getClientIp, logEvent } from "@/lib/history-log";
import { createSupabaseMock } from "../../test/helpers/supabase";
import { makeRequest } from "../../test/helpers/request";

const { createServiceRoleClient } = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient }));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("getClientIp", () => {
  it("takes the first address from x-forwarded-for", () => {
    const req = makeRequest("/api/x", { headers: { "x-forwarded-for": " 9.9.9.9 , 5.5.5.5" } });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("falls back to x-real-ip", () => {
    const req = makeRequest("/api/x", { headers: { "x-real-ip": "8.8.8.8" } });
    expect(getClientIp(req)).toBe("8.8.8.8");
  });

  it("prefers x-forwarded-for over x-real-ip", () => {
    const req = makeRequest("/api/x", {
      headers: { "x-forwarded-for": "9.9.9.9", "x-real-ip": "8.8.8.8" },
    });
    expect(getClientIp(req)).toBe("9.9.9.9");
  });

  it("returns null when neither header is present", () => {
    expect(getClientIp(makeRequest("/api/x"))).toBeNull();
  });

  it("returns null for an empty x-forwarded-for", () => {
    expect(getClientIp(makeRequest("/api/x", { headers: { "x-forwarded-for": "" } }))).toBeNull();
  });
});

describe("logEvent", () => {
  const params = {
    entityType: "booking",
    entityId: "booking-1",
    eventType: EventType.BOOKING_CREATED,
    actorType: "guest" as const,
  };

  it("writes a history row with the supplied details", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent({
      ...params,
      homestayId: "homestay-1",
      actorId: "guest-1",
      data: { total: 2000 },
      ipAddress: "1.2.3.4",
    });

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith({
      homestay_id: "homestay-1",
      entity_type: "booking",
      entity_id: "booking-1",
      event_type: EventType.BOOKING_CREATED,
      actor_type: "guest",
      actor_id: "guest-1",
      data: { total: 2000 },
      ip_address: "1.2.3.4",
    });
  });

  it("defaults the optional fields rather than writing undefined", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent(params);

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith(
      expect.objectContaining({ homestay_id: null, actor_id: null, data: {}, ip_address: null }),
    );
  });

  it("takes the IP from the request when none is given", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent({ ...params, req: makeRequest("/api/x", { headers: { "x-forwarded-for": "9.9.9.9, 1.1.1.1" } }) });

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: "9.9.9.9" }),
    );
  });

  it("falls back to x-real-ip on the request", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent({ ...params, req: makeRequest("/api/x", { headers: { "x-real-ip": "8.8.8.8" } }) });

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: "8.8.8.8" }),
    );
  });

  it("prefers an explicit IP over the request headers", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent({
      ...params,
      ipAddress: "1.2.3.4",
      req: makeRequest("/api/x", { headers: { "x-forwarded-for": "9.9.9.9" } }),
    });

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: "1.2.3.4" }),
    );
  });

  it("records null when the request carries no address at all", async () => {
    const supabase = createSupabaseMock({ tables: { history_logs: {} } });
    createServiceRoleClient.mockReturnValue(supabase);

    await logEvent({ ...params, req: makeRequest("/api/x") });

    expect(supabase.builderFor("history_logs").insert).toHaveBeenCalledWith(
      expect.objectContaining({ ip_address: null }),
    );
  });

  it("never lets a logging failure break the caller", async () => {
    createServiceRoleClient.mockImplementation(() => {
      throw new Error("no database");
    });

    await expect(logEvent(params)).resolves.toBeUndefined();
    expect(console.error).toHaveBeenCalled();
  });
});
