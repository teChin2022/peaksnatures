import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";
import {
  createSupabaseMock,
  type QueryResponse,
  type SupabaseMockOptions,
} from "../../../../../test/helpers/supabase";
import { makeFormRequest, readJson, uniqueIp } from "../../../../../test/helpers/request";
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS_PER_BOOKING } from "@/lib/booking-attachments";

const h = vi.hoisted(() => ({
  createServerSupabaseClient: vi.fn(),
  createServiceRoleClient: vi.fn(),
  afterCallbacks: [] as Array<() => unknown>,
  logEvent: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabaseClient: h.createServerSupabaseClient,
  createServiceRoleClient: h.createServiceRoleClient,
}));
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (cb: () => unknown) => {
    h.afterCallbacks.push(cb);
  },
}));
vi.mock("@/lib/history-log", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/history-log")>()),
  logEvent: h.logEvent,
}));

const HOMESTAY_ID = "11111111-1111-1111-1111-111111111111";
const BOOKING_ID = "22222222-2222-2222-2222-222222222222";

const owned = {
  id: BOOKING_ID,
  homestay_id: HOMESTAY_ID,
  status: "confirmed",
  homestay: { host: { id: "host-1", name: "Somchai", user_id: "user-1" } },
};

const insertedRow = {
  id: "33333333-3333-3333-3333-333333333333",
  booking_id: BOOKING_ID,
  storage_path: `${HOMESTAY_ID}/${BOOKING_ID}/33333333-3333-3333-3333-333333333333.png`,
  mime_type: "image/png",
  byte_size: 1024,
  created_at: "2026-09-16T00:00:00Z",
};

const shot = (
  bytes = 1024,
  name = "chat.png",
  type = "image/png",
) => new File([new Uint8Array(bytes)], name, { type });

function mockClient(
  tables: Record<string, QueryResponse | QueryResponse[]> = {},
  options: Partial<SupabaseMockOptions> = {},
) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  const supabase = createSupabaseMock({
    tables: {
      bookings: { data: owned },
      // First call is the head count, second is the insert.
      booking_attachments: [{ count: 0 }, { data: insertedRow }],
      ...tables,
    },
    ...options,
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const post = (fields: Record<string, string | File> = {}) =>
  POST(
    makeFormRequest(
      "/api/bookings/attachments",
      { booking_id: BOOKING_ID, file: shot(), ...fields },
      { ip: uniqueIp() },
    ),
  );

const runAfter = async () => {
  for (const cb of h.afterCallbacks.splice(0)) await cb();
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  h.afterCallbacks.length = 0;
  h.logEvent.mockResolvedValue(undefined);
  mockClient();
});

describe("POST /api/bookings/attachments", () => {
  describe("who is turned away", () => {
    it("401s an unauthenticated caller", async () => {
      h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      expect((await readJson(await post())).status).toBe(401);
    });

    it("404s a booking that does not exist", async () => {
      mockClient({ bookings: { data: null } });
      expect((await readJson(await post())).status).toBe(404);
    });

    // The whole point of the feature is that these are private to one host.
    it("403s another host's booking without touching storage", async () => {
      const supabase = mockClient({
        bookings: {
          data: { ...owned, homestay: { host: { id: "host-2", name: "Ana", user_id: "user-2" } } },
        },
      });
      const { status } = await readJson(await post());
      expect(status).toBe(403);
      expect(supabase.storage.upload).not.toHaveBeenCalled();
    });

    it("403s a booking whose ownership chain is broken", async () => {
      mockClient({ bookings: { data: { ...owned, homestay: null } } });
      expect((await readJson(await post())).status).toBe(403);
    });
  });

  describe("what it refuses to store", () => {
    it("400s a missing booking id", async () => {
      const res = await POST(
        makeFormRequest("/api/bookings/attachments", { file: shot() }, { ip: uniqueIp() }),
      );
      const { status, body } = await readJson(res);
      expect(status).toBe(400);
      expect(body).toMatchObject({ reason: "MISSING_BOOKING_ID" });
    });

    it("400s a request with no file", async () => {
      const res = await POST(
        makeFormRequest(
          "/api/bookings/attachments",
          { booking_id: BOOKING_ID },
          { ip: uniqueIp() },
        ),
      );
      const { status, body } = await readJson(res);
      expect(status).toBe(400);
      expect(body).toMatchObject({ reason: "NO_FILE" });
    });

    it("400s a type outside the allowlist", async () => {
      const supabase = mockClient();
      const { status, body } = await readJson(await post({ file: shot(1024, "x.gif", "image/gif") }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ reason: "INVALID_FILE_TYPE" });
      expect(supabase.storage.upload).not.toHaveBeenCalled();
    });

    it("400s one byte over the size cap", async () => {
      const { status, body } = await readJson(await post({ file: shot(MAX_ATTACHMENT_BYTES + 1) }));
      expect(status).toBe(400);
      expect(body).toMatchObject({ reason: "FILE_TOO_LARGE" });
    });

    // A full booking is a state conflict, not a malformed request.
    it("409s at the per-booking cap, writing nothing", async () => {
      const supabase = mockClient({
        booking_attachments: [{ count: MAX_ATTACHMENTS_PER_BOOKING }],
      });
      const { status, body } = await readJson(await post());
      expect(status).toBe(409);
      expect(body).toMatchObject({ reason: "LIMIT_REACHED" });
      expect(supabase.storage.upload).not.toHaveBeenCalled();
      expect(supabase.calls.filter((c) => c.table === "booking_attachments")).toHaveLength(1);
    });

    it.each(["cancelled", "rejected"])("409s a %s booking", async (status) => {
      mockClient({ bookings: { data: { ...owned, status } } });
      const res = await readJson(await post());
      expect(res.status).toBe(409);
      expect(res.body).toMatchObject({ reason: "BOOKING_INACTIVE" });
    });

    // Deliberately permissive: a host confirming a pending booking often has
    // the chat open at that exact moment.
    it.each(["pending", "verified", "confirmed", "completed"])(
      "accepts a %s booking",
      async (status) => {
        mockClient({ bookings: { data: { ...owned, status } } });
        expect((await readJson(await post())).status).toBe(200);
      },
    );
  });

  describe("the happy path", () => {
    it("stores the file under {homestay}/{booking}/{uuid}.{ext}", async () => {
      const supabase = mockClient();
      expect((await readJson(await post())).status).toBe(200);

      const [path, file, opts] = supabase.storage.upload.mock.calls[0];
      expect(path).toMatch(
        new RegExp(`^${HOMESTAY_ID}/${BOOKING_ID}/[0-9a-f-]{36}\\.png$`),
      );
      expect(file).toBeInstanceOf(File);
      // upsert:false — the path carries a fresh UUID, so a collision means
      // something is badly wrong and must fail loudly rather than overwrite.
      expect(opts).toMatchObject({ contentType: "image/png", upsert: false });
    });

    it("gives the row the same id as the object in its path", async () => {
      const supabase = mockClient();
      await post();

      const [path] = supabase.storage.upload.mock.calls[0];
      const idInPath = String(path).split("/")[2].replace(/\.\w+$/, "");
      const insert = supabase.builderFor("booking_attachments", 1).insert as ReturnType<typeof vi.fn>;
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({
          id: idInPath,
          booking_id: BOOKING_ID,
          homestay_id: HOMESTAY_ID,
          storage_path: path,
          mime_type: "image/png",
          byte_size: 1024,
          created_by: "Somchai",
        }),
      );
    });

    it("returns a signed URL so the new tile renders without a refetch", async () => {
      const { body } = await readJson(await post());
      expect(body).toMatchObject({
        success: true,
        attachment: { id: insertedRow.id, signed_url: "https://storage.test/signed-slip" },
      });
    });

    it("logs the attachment against the booking", async () => {
      await post();
      await runAfter();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "booking",
          entityId: BOOKING_ID,
          eventType: "BOOKING_ATTACHMENT_ADDED",
          actorType: "host",
          homestayId: HOMESTAY_ID,
        }),
      );
    });
  });

  describe("when a write fails halfway", () => {
    it("500s on an upload failure without inserting a row", async () => {
      const supabase = mockClient({}, { storage: { uploadError: { message: "boom" } } });
      const { status, body } = await readJson(await post());
      expect(status).toBe(500);
      expect(body).toMatchObject({ reason: "UPLOAD_FAILED" });
      expect(supabase.calls.filter((c) => c.table === "booking_attachments")).toHaveLength(1);
    });

    // The compensating delete. Without it the object survives with nothing
    // referencing it, in a private bucket nobody can list from the dashboard.
    it("removes the object it just uploaded when the insert fails", async () => {
      const supabase = mockClient({
        booking_attachments: [{ count: 0 }, { error: { message: "constraint" } }],
      });
      const { status } = await readJson(await post());
      expect(status).toBe(500);

      const [uploadedPath] = supabase.storage.upload.mock.calls[0];
      expect(supabase.storage.remove).toHaveBeenCalledWith([uploadedPath]);
    });

    it("500s when the existing-count query fails, before touching storage", async () => {
      const supabase = mockClient({
        booking_attachments: [{ error: { message: "down" } }],
      });
      expect((await readJson(await post())).status).toBe(500);
      expect(supabase.storage.upload).not.toHaveBeenCalled();
    });
  });

  it("rate limits a caller hammering one address", async () => {
    const ip = uniqueIp();
    const fire = () =>
      POST(
        makeFormRequest(
          "/api/bookings/attachments",
          { booking_id: BOOKING_ID, file: shot() },
          { ip },
        ),
      );
    const statuses: number[] = [];
    for (let i = 0; i < 21; i++) {
      mockClient();
      statuses.push((await fire()).status);
    }
    expect(statuses.at(-1)).toBe(429);
  });
});
