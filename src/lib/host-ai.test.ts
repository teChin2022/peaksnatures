import { describe, expect, it } from "vitest";
import { adminAiDecisionSchema, canRequestAi, hostAiSettingsSchema, nextAiStatus } from "./host-ai";

describe("hostAiSettingsSchema", () => {
  it("takes the host's own switch, permissions and instructions", () => {
    expect(hostAiSettingsSchema.safeParse({ enabled: true, can_set_dates: false, instructions: "  ที่จอดรถ 3 คัน  " }).data)
      .toEqual({ enabled: true, can_set_dates: false, instructions: "ที่จอดรถ 3 คัน" });
  });

  // Security review F-04: a host must not approve itself or raise its own cap.
  it.each([
    [{ status: "approved" }],
    [{ enabled: true, status: "approved" }],
    [{ daily_reply_cap: 1000 }],
    [{ decided_by: "me" }],
    [{ host_id: "someone-else" }],
  ])("refuses %j", (body) => {
    expect(hostAiSettingsSchema.safeParse(body).success).toBe(false);
  });

  it("refuses an empty body and instructions over 2000 characters", () => {
    expect(hostAiSettingsSchema.safeParse({}).success).toBe(false);
    expect(hostAiSettingsSchema.safeParse({ instructions: "x".repeat(2001) }).success).toBe(false);
    expect(hostAiSettingsSchema.safeParse({ instructions: "x".repeat(2000) }).success).toBe(true);
  });
});

describe("adminAiDecisionSchema", () => {
  it("takes an action, a cap, or both", () => {
    expect(adminAiDecisionSchema.safeParse({ action: "approve" }).success).toBe(true);
    expect(adminAiDecisionSchema.safeParse({ daily_reply_cap: 0 }).success).toBe(true);
    expect(adminAiDecisionSchema.safeParse({ action: "suspend", daily_reply_cap: 100 }).success).toBe(true);
  });

  it.each([[{}], [{ action: "delete" }], [{ daily_reply_cap: 1001 }], [{ daily_reply_cap: 2.5 }], [{ action: "approve", enabled: true }]])(
    "refuses %j",
    (body) => {
      expect(adminAiDecisionSchema.safeParse(body).success).toBe(false);
    },
  );
});

describe("nextAiStatus", () => {
  it("follows request → approve → suspend → resume", () => {
    expect(nextAiStatus("approve", "requested")).toBe("approved");
    expect(nextAiStatus("suspend", "approved")).toBe("suspended");
    expect(nextAiStatus("resume", "suspended")).toBe("approved");
  });

  it("lets an admin reject a request, then approve it after all", () => {
    expect(nextAiStatus("reject", "requested")).toBe("rejected");
    expect(nextAiStatus("approve", "rejected")).toBe("approved");
  });

  it.each([
    ["approve", "approved"],
    ["approve", "suspended"],
    ["reject", "approved"],
    ["suspend", "requested"],
    ["resume", "approved"],
  ] as const)("refuses %s from %s", (action, current) => {
    expect(nextAiStatus(action, current)).toBeNull();
  });
});

describe("canRequestAi", () => {
  it("allows a first request and a new one after a rejection only", () => {
    expect(canRequestAi(null)).toBe(true);
    expect(canRequestAi("rejected")).toBe(true);
    expect(canRequestAi("requested")).toBe(false);
    expect(canRequestAi("approved")).toBe(false);
    expect(canRequestAi("suspended")).toBe(false);
  });
});
