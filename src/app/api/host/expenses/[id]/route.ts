import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { ownerHost, parseExpense } from "../shared";

type Ctx = { params: Promise<{ id: string }> };

const idSchema = z.string().uuid();

/** PATCH /api/host/expenses/[id] — correct one of the signed-in owner's expenses. */
export async function PATCH(req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    const expense = parseExpense(await req.json().catch(() => null));
    if (!idSchema.safeParse(id).success || !expense) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;

    // Scoped by host_id, so another host's id changes nothing and reads as not found.
    const { data, error } = await owner.sc
      .from("host_expenses")
      .update(expense as never)
      .eq("id", id)
      .eq("host_id", owner.hostId)
      .select("id");
    if (error) {
      console.error("[HostExpenses] Update failed:", error);
      return NextResponse.json({ error: "Failed to save" }, { status: 500 });
    }
    if (!data || (data as unknown[]).length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ id });
  } catch (error) {
    console.error("[HostExpenses] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}

/** DELETE /api/host/expenses/[id] — remove one of the signed-in owner's expenses. */
export async function DELETE(_req: NextRequest, ctx: Ctx) {
  try {
    const { id } = await ctx.params;
    if (!idSchema.safeParse(id).success) {
      return NextResponse.json({ error: "Invalid request" }, { status: 400 });
    }

    const owner = await ownerHost();
    if (owner instanceof NextResponse) return owner;

    // Scoped by host_id, so another host's id deletes nothing and reads as not found.
    const { data, error } = await owner.sc
      .from("host_expenses")
      .delete()
      .eq("id", id)
      .eq("host_id", owner.hostId)
      .select("id");
    if (error) {
      console.error("[HostExpenses] Delete failed:", error);
      return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
    }
    if (!data || (data as unknown[]).length === 0) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("[HostExpenses] Error:", error);
    return NextResponse.json({ error: "Something went wrong" }, { status: 500 });
  }
}
