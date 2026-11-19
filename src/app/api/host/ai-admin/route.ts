import { NextRequest, NextResponse, after } from "next/server";
import { ownerHost } from "@/app/api/host/expenses/shared";
import { alertAdmins } from "@/lib/admin-alert";
import { logEvent, EventType } from "@/lib/history-log";
import { HOST_AI_COLUMNS, canRequestAi, hostAiSettingsSchema } from "@/lib/host-ai";
import type { HostAiStatus } from "@/types/database";

/**
 * The host's guest AI assistant (migration 084). Owner only: staff logins have
 * no hosts row, so ownerHost() answers them 404 (owner's call, 2026-11-19).
 *
 * GET   → { settings, pricePerReply } (settings null before the first request; the price is the
 *         platform's, 086, so the host sees what a reply costs before turning it on)
 * POST  → ask for the assistant (again after a rejection); admins are alerted
 * PATCH → change the host's own switch, permissions and instructions, only
 *         once approved. Status and the daily cap are the admin's.
 */

const NO_STORE = { "Cache-Control": "private, no-store" };

export async function GET() {
  try {
    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;
    const { sc, hostId } = owner;

    const [{ data, error }, { data: platform }] = await Promise.all([
      sc.from("host_ai_settings").select(HOST_AI_COLUMNS).eq("host_id", hostId).maybeSingle(),
      sc.from("platform_guest_ai_config").select("price_per_reply").maybeSingle(),
    ]);
    if (error) {
      console.error("[Host AI] fetch error:", error);
      return NextResponse.json({ error: "Failed to load" }, { status: 500 });
    }
    // NUMERIC arrives as a string; no config row (before 085 / 086) reads as free.
    const pricePerReply = Number((platform as { price_per_reply: number | string } | null)?.price_per_reply ?? 0);
    return NextResponse.json({ settings: data ?? null, pricePerReply }, { headers: NO_STORE });
  } catch (error) {
    console.error("[Host AI] GET error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;
    const { sc, hostId, userId } = owner;

    const { data: existing } = await sc.from("host_ai_settings").select("status").eq("host_id", hostId).maybeSingle();
    const current = ((existing as { status: HostAiStatus } | null)?.status ?? null) as HostAiStatus | null;
    if (!canRequestAi(current)) {
      return NextResponse.json({ error: "Already requested" }, { status: 409 });
    }

    const now = new Date().toISOString();
    const write =
      current === null
        ? sc.from("host_ai_settings").insert({ host_id: hostId } as never)
        : sc
            .from("host_ai_settings")
            .update({ status: "requested", requested_at: now, decided_at: null, decided_by: null, updated_at: now } as never)
            .eq("host_id", hostId)
            .eq("status", "rejected");
    const { data, error } = await write.select(HOST_AI_COLUMNS).maybeSingle();
    if (error || !data) {
      // A second request racing the first hits the primary key (23505) or finds the row already moved on.
      if (!data && (!error || (error as { code?: string }).code === "23505")) {
        return NextResponse.json({ error: "Already requested" }, { status: 409 });
      }
      console.error("[Host AI] request error:", error);
      return NextResponse.json({ error: "Failed to send request" }, { status: 500 });
    }

    const { data: host } = await sc.from("hosts").select("name").eq("id", hostId).maybeSingle();
    const hostName = (host as { name: string | null } | null)?.name || hostId;
    after(async () => {
      await logEvent({
        entityType: "host",
        entityId: hostId,
        eventType: EventType.GUEST_AI_REQUESTED,
        actorType: "host",
        actorId: userId,
        data: { host_name: hostName, again: current === "rejected" },
        req,
      });
      await alertAdmins(`มีคำขอเปิดผู้ช่วย AI ของแขก: ${hostName} (อนุมัติที่ /admin)`);
    });

    return NextResponse.json({ settings: data }, { status: 201 });
  } catch (error) {
    console.error("[Host AI] POST error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);
    const parsed = hostAiSettingsSchema.safeParse(body);
    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;
    const { sc, hostId, userId } = owner;

    const changes = { ...parsed.data, ...(parsed.data.instructions === "" ? { instructions: null } : {}) };
    // Only an approved assistant takes settings; the status filter makes that one statement.
    const { data, error } = await sc
      .from("host_ai_settings")
      .update({ ...changes, updated_at: new Date().toISOString() } as never)
      .eq("host_id", hostId)
      .eq("status", "approved")
      .select(HOST_AI_COLUMNS)
      .maybeSingle();
    if (error) {
      console.error("[Host AI] update error:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: "Not approved" }, { status: 409 });
    }

    after(() =>
      logEvent({
        entityType: "host",
        entityId: hostId,
        eventType: EventType.GUEST_AI_SETTINGS_CHANGED,
        actorType: "host",
        actorId: userId,
        // Which fields changed; the instructions text itself stays out of the log.
        data: Object.fromEntries(
          Object.entries(changes).map(([k, v]) => [k, k === "instructions" ? (v ? "updated" : "cleared") : v]),
        ),
        req,
      }),
    );

    return NextResponse.json({ settings: data });
  } catch (error) {
    console.error("[Host AI] PATCH error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
