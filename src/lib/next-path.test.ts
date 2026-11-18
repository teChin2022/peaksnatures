import { describe, expect, it } from "vitest";
import { adminNextPath, hostNextPath } from "./next-path";

describe("adminNextPath", () => {
  it("keeps an internal admin page, with its query", () => {
    expect(adminNextPath("/admin/billing/rejected")).toBe("/admin/billing/rejected");
    expect(adminNextPath("/admin/logs?event_type=PLATFORM_PAYMENT_REJECTED")).toBe(
      "/admin/logs?event_type=PLATFORM_PAYMENT_REJECTED",
    );
    expect(adminNextPath("/admin")).toBe("/admin");
  });

  it("falls back to /admin for anything that leaves the admin area", () => {
    for (const raw of [
      null,
      "",
      "https://evil.example/admin",
      "//evil.example/admin",
      "/\\evil.example",
      "/admin\\..\\..\\x",
      "/adminx",
      "/admin/../dashboard",
      "/admin/%2e%2e/dashboard",
      "/dashboard",
      "/admin/login",
      "/admin /x",
    ]) {
      expect(adminNextPath(raw)).toBe("/admin");
    }
  });
});

describe("hostNextPath", () => {
  it("keeps a dashboard page, with its query", () => {
    expect(hostNextPath("/dashboard/bookings?tab=pending")).toBe("/dashboard/bookings?tab=pending");
    expect(hostNextPath("/dashboard")).toBe("/dashboard");
  });

  it("falls back to /dashboard for anything that leaves the dashboard", () => {
    for (const raw of [
      null,
      "https://evil.example/dashboard",
      "//evil.example/dashboard",
      "/\\evil.example",
      "/dashboardx",
      "/dashboard/../admin",
      "/admin",
      "javascript:alert(1)",
    ]) {
      expect(hostNextPath(raw)).toBe("/dashboard");
    }
  });
});
