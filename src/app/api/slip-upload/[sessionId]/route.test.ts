import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET, POST } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeFormRequest, makeRequest, uniqueIp } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({ createServiceRoleClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createServiceRoleClient: h.createServiceRoleClient }));

const SESSION = "3f2a9c1e-0000-4000-8000-123456789abc";
const params = { params: Promise.resolve({ sessionId: SESSION }) };
const slip = () => new File([new Uint8Array(32)], "slip.jpg", { type: "image/jpeg" });

const upload = (ip: string) => POST(makeFormRequest(`/api/slip-upload/${SESSION}`, { slip: slip() }, { ip }), params);
const poll = (ip: string) => GET(makeRequest(`/api/slip-upload/${SESSION}`, { method: "GET", ip }), params);

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.createServiceRoleClient.mockReturnValue(createSupabaseMock());
});

describe("/api/slip-upload/[sessionId]", () => {
  it("stores a slip from the phone", async () => {
    expect((await upload(uniqueIp())).status).toBe(200);
  });

  // F-18: anyone could write into the slips bucket through this route, as
  // often as they liked.
  it("limits uploads from one address", async () => {
    const ip = uniqueIp();
    for (let i = 0; i < 20; i++) {
      expect((await upload(ip)).status).toBe(200);
    }
    expect((await upload(ip)).status).toBe(429);
  });

  // The desktop page polls every 3 seconds while the guest uses their phone.
  it("does not limit the desktop's polling", async () => {
    // Nothing uploaded yet: the route lists an empty folder.
    h.createServiceRoleClient.mockReturnValue({ storage: { from: () => ({ list: async () => ({ data: [] }) }) } });
    const ip = uniqueIp();
    for (let i = 0; i < 40; i++) {
      expect((await poll(ip)).status).toBe(200);
    }
  });
});
