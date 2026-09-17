import { beforeEach, describe, expect, it, vi } from "vitest";
import { DELETE } from "./route";
import {
  createSupabaseMock,
  type QueryResponse,
  type SupabaseMockOptions,
} from "../../../../../../test/helpers/supabase";
import { makeRequest, readJson, uniqueIp } from "../../../../../../test/helpers/request";

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
const ATTACHMENT_ID = "33333333-3333-3333-3333-333333333333";
const STORAGE_PATH = `${HOMESTAY_ID}/${BOOKING_ID}/${ATTACHMENT_ID}.png`;

const owned = {
  id: ATTACHMENT_ID,
  booking_id: BOOKING_ID,
  homestay_id: HOMESTAY_ID,
  storage_path: STORAGE_PATH,
  booking: { homestay: { host: { id: "host-1", name: "Somchai", user_id: "user-1" } } },
};

function mockClient(
  tables: Record<string, QueryResponse | QueryResponse[]> = {},
  options: Partial<SupabaseMockOptions> = {},
) {
  h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: { id: "user-1" } }));
  const supabase = createSupabaseMock({
    // First call is the ownership select, second is the delete.
    tables: { booking_attachments: [{ data: owned }, {}], ...tables },
    ...options,
  });
  h.createServiceRoleClient.mockReturnValue(supabase);
  return supabase;
}

const del = (id = ATTACHMENT_ID) =>
  DELETE(
    makeRequest(`/api/bookings/attachments/${id}`, { method: "DELETE", ip: uniqueIp() }),
    { params: Promise.resolve({ id }) },
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

describe("DELETE /api/bookings/attachments/[id]", () => {
  describe("who is turned away", () => {
    it("401s an unauthenticated caller", async () => {
      h.createServerSupabaseClient.mockResolvedValue(createSupabaseMock({ user: null }));
      expect((await readJson(await del())).status).toBe(401);
    });

    it("400s a missing id", async () => {
      expect((await readJson(await del(""))).status).toBe(400);
    });

    it("404s an attachment that does not exist", async () => {
      mockClient({ booking_attachments: [{ data: null }] });
      expect((await readJson(await del())).status).toBe(404);
    });

    it("403s another host's attachment without touching storage", async () => {
      const supabase = mockClient({
        booking_attachments: [
          {
            data: {
              ...owned,
              booking: { homestay: { host: { id: "host-2", name: "Ana", user_id: "user-2" } } },
            },
          },
        ],
      });
      expect((await readJson(await del())).status).toBe(403);
      expect(supabase.storage.remove).not.toHaveBeenCalled();
    });

    it("403s an attachment whose ownership chain is broken", async () => {
      mockClient({ booking_attachments: [{ data: { ...owned, booking: null } }] });
      expect((await readJson(await del())).status).toBe(403);
    });
  });

  describe("the happy path", () => {
    it("removes the object and the row", async () => {
      const supabase = mockClient();
      const { status, body } = await readJson(await del());
      expect(status).toBe(200);
      expect(body).toMatchObject({ success: true });
      expect(supabase.storage.remove).toHaveBeenCalledWith([STORAGE_PATH]);

      const deleteBuilder = supabase.builderFor("booking_attachments", 1);
      expect(deleteBuilder.delete).toHaveBeenCalled();
      expect(deleteBuilder.eq).toHaveBeenCalledWith("id", ATTACHMENT_ID);
    });

    // ORDER IS THE POINT, not just that both ran. Row-first-then-remove leaves
    // an object nothing references, in a private bucket, with no sweep in this
    // codebase that would ever find it.
    it("removes the object BEFORE deleting the row", async () => {
      const supabase = mockClient();
      await del();

      const removeOrder = supabase.storage.remove.mock.invocationCallOrder[0];
      const deleteFn = supabase.builderFor("booking_attachments", 1).delete as ReturnType<typeof vi.fn>;
      expect(removeOrder).toBeLessThan(deleteFn.mock.invocationCallOrder[0]);
    });

    it("logs the removal against the booking", async () => {
      await del();
      await runAfter();
      expect(h.logEvent).toHaveBeenCalledWith(
        expect.objectContaining({
          entityType: "booking",
          entityId: BOOKING_ID,
          eventType: "BOOKING_ATTACHMENT_REMOVED",
          actorType: "host",
          homestayId: HOMESTAY_ID,
        }),
      );
    });
  });

  describe("when a write fails halfway", () => {
    // Keeping the row is the recovery path: the host sees a broken tile and
    // taps delete again. Dropping it would throw away the only pointer to the
    // object still sitting in the bucket.
    it("keeps the row when the object cannot be removed", async () => {
      const supabase = mockClient({}, { storage: { removeError: { message: "boom" } } });
      expect((await readJson(await del())).status).toBe(500);
      expect(supabase.calls.filter((c) => c.table === "booking_attachments")).toHaveLength(1);
    });

    it("500s when the row delete fails", async () => {
      mockClient({ booking_attachments: [{ data: owned }, { error: { message: "boom" } }] });
      expect((await readJson(await del())).status).toBe(500);
    });
  });
});
