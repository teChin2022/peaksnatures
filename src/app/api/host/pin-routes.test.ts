import { beforeEach, describe, expect, it, vi } from "vitest";
import bcrypt from "bcryptjs";
import { POST as reveal } from "./reveal-sensitive/route";
import { POST as update } from "./update-sensitive/route";
import { PUT as changePin } from "./security-pin/route";
import { createSupabaseMock } from "../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../test/helpers/request";

/**
 * The three routes that check the host's security PIN share one per-host
 * limit (src/lib/security-pin.ts, audit F-13): a 4-digit PIN with no limit
 * could be guessed by anyone holding the host's session.
 */

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: vi.fn(),
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: () => {},
}));

const PIN_HASH = bcrypt.hashSync("1234", 4);
let userSeq = 0;

/** A host session with a PIN set. A fresh user each time: the limit is per user. */
function signedInHost() {
  const userId = `user-${++userSeq}`;
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: userId } }));
  const sc = createSupabaseMock({
    tables: {
      hosts: {
        data: {
          id: "host-1",
          name: "Somchai",
          security_pin_hash: PIN_HASH,
          email: "host@example.com",
          phone: "0812345678",
          promptpay_id: "0812345678",
        },
      },
    },
  });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const call = async (route: (r: never) => Promise<Response>, path: string, body: unknown, method = "POST") =>
  readJson(await route(makeRequest(path, { method, body }) as never));

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("security PIN routes: tries per host", () => {
  it.each([
    ["reveal-sensitive", () => call(reveal, "/api/host/reveal-sensitive", { pin: "0000" })],
    ["update-sensitive", () => call(update, "/api/host/update-sensitive", { pin: "0000", phone: "0899999999" })],
    ["security-pin PUT", () => call(changePin, "/api/host/security-pin", { currentPin: "0000", newPin: "5678" }, "PUT")],
  ])("%s stops a sixth try within 15 minutes", async (_, attempt) => {
    signedInHost();

    for (let i = 0; i < 5; i++) {
      expect((await attempt()).status).toBe(403);
    }
    expect((await attempt()).status).toBe(429);
  });

  it("counts tries across the three routes together", async () => {
    signedInHost();

    for (let i = 0; i < 3; i++) await call(reveal, "/api/host/reveal-sensitive", { pin: "0000" });
    for (let i = 0; i < 2; i++) await call(update, "/api/host/update-sensitive", { pin: "0000" });

    expect((await call(changePin, "/api/host/security-pin", { currentPin: "1234", newPin: "5678" }, "PUT")).status).toBe(429);
  });

  it("still lets the right PIN through", async () => {
    signedInHost();
    const { status } = await call(reveal, "/api/host/reveal-sensitive", { pin: "1234" });
    expect(status).toBe(200);
  });
});

describe("update-sensitive: the OTP switch", () => {
  // F-11/F-13: hosts could turn their own login OTP off through REST with no
  // PIN. Migration 079 takes the column from the browser; this is its one way in.
  it("saves require_otp behind the PIN", async () => {
    const sc = signedInHost();

    const { status } = await call(update, "/api/host/update-sensitive", { pin: "1234", require_otp: false });

    expect(status).toBe(200);
    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(
      expect.objectContaining({ require_otp: false, updated_by: "Somchai" }),
    );
  });

  it("ignores a require_otp that is not a boolean", async () => {
    const sc = signedInHost();

    await call(update, "/api/host/update-sensitive", { pin: "1234", require_otp: "no", phone: "0899999999" });

    expect(sc.builderFor("hosts", 1).update).toHaveBeenCalledWith(expect.not.objectContaining({ require_otp: expect.anything() }));
  });

  it("does not save it with the wrong PIN", async () => {
    const sc = signedInHost();

    expect((await call(update, "/api/host/update-sensitive", { pin: "0000", require_otp: false })).status).toBe(403);
    expect(sc.calls.filter((c) => c.table === "hosts")).toHaveLength(1);
  });
});
