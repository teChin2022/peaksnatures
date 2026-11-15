import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import { createSupabaseMock } from "../../../../../test/helpers/supabase";
import { makeRequest, readJson } from "../../../../../test/helpers/request";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));

function mockClients(host: Record<string, unknown> | null = { id: "host-1", name: "Somchai", phone: null, promptpay_id: "" }, user: { id: string } | null = { id: "user-1" }) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user }));
  const sc = createSupabaseMock({ tables: { hosts: [{ data: host }, { data: null }] } });
  h.createServiceRoleClient.mockReturnValue(sc);
  return sc;
}

const post = async (body: unknown) => readJson(await POST(makeRequest("/api/host/setup-profile", { body })));
const written = (sc: ReturnType<typeof createSupabaseMock>) =>
  sc.calls.length > 1 ? (sc.builderFor("hosts", 1).update as ReturnType<typeof vi.fn>).mock.calls[0]?.[0] : undefined;

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("POST /api/host/setup-profile", () => {
  it("fills in a phone and PromptPay the host has not set yet", async () => {
    const sc = mockClients();

    const { status, body } = await post({ phone: "0812345678", promptpay_id: " 0812345678 " });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, updated: ["phone", "promptpay_id"] });
    expect(written(sc)).toEqual({ phone: "0812345678", promptpay_id: "0812345678", updated_by: "Somchai" });
    expect(sc.builderFor("hosts", 1).eq).toHaveBeenCalledWith("id", "host-1");
  });

  // F-13: the browser used to write promptpay_id straight to hosts, so a
  // stolen session could swap the account guests pay into without the PIN.
  // Changing a value that is already set goes through update-sensitive.
  it("will not overwrite a PromptPay that is already set", async () => {
    const sc = mockClients({ id: "host-1", name: "Somchai", phone: null, promptpay_id: "0899999999" });

    const { body } = await post({ phone: "0812345678", promptpay_id: "0811111111" });

    expect(body).toEqual({ success: true, updated: ["phone"] });
    expect(written(sc)).toEqual({ phone: "0812345678", updated_by: "Somchai" });
  });

  it("writes nothing when everything asked for is already set", async () => {
    const sc = mockClients({ id: "host-1", name: "Somchai", phone: "0800000000", promptpay_id: "0899999999" });

    const { status, body } = await post({ phone: "0812345678" });

    expect(status).toBe(200);
    expect(body).toEqual({ success: true, updated: [] });
    expect(sc.calls).toHaveLength(1);
  });

  it.each([
    ["a phone that is not 10 digits", { phone: "081-234-5678" }],
    ["an empty PromptPay", { promptpay_id: "  " }],
    ["a PromptPay longer than any real one", { promptpay_id: "1".repeat(21) }],
  ])("refuses %s", async (_, body) => {
    mockClients();
    expect((await post(body)).status).toBe(400);
  });

  it("refuses a visitor who is not signed in", async () => {
    const sc = mockClients(undefined, null);
    expect((await post({ phone: "0812345678" })).status).toBe(401);
    expect(sc.from).not.toHaveBeenCalled();
  });

  it("reports 404 for a signed-in user with no host row", async () => {
    mockClients(null);
    expect((await post({ phone: "0812345678" })).status).toBe(404);
  });
});
