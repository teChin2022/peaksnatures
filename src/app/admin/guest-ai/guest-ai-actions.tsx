"use client";

import { useId, useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { NETWORK_ERROR, actionFailed } from "@/components/admin/load-error";
import { AI_REPLY_CAP_MAX, type AdminAiAction } from "@/lib/host-ai";
import type { HostAiStatus } from "@/types/database";

/** The actions each status offers, primary first. */
export const ACTIONS_FOR: Record<HostAiStatus, AdminAiAction[]> = {
  requested: ["approve", "reject"],
  rejected: ["approve"],
  approved: ["suspend"],
  suspended: ["resume"],
};

const LABEL: Record<AdminAiAction, string> = { approve: "Approve", reject: "Reject", suspend: "Suspend", resume: "Resume" };
const DONE: Record<AdminAiAction, string> = { approve: "Approved", reject: "Rejected", suspend: "Suspended", resume: "Resumed" };

/** Reject and suspend take a confirmation: the host is told at once. */
const CONFIRM: Partial<Record<AdminAiAction, (host: string) => { title: string; body: string }>> = {
  reject: (host) => ({
    title: `Reject ${host}'s request?`,
    body: "The host is told by LINE, SMS or email and may ask again later.",
  }),
  suspend: (host) => ({
    title: `Suspend ${host}'s guest AI?`,
    body: "It stops answering guests at once, whatever the host's switch says. The host is told; resume it here.",
  }),
};

async function send(hostId: string, body: object): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/admin/hosts/${hostId}/ai`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (r.ok) return { ok: true };
    const data = await r.json().catch(() => ({}));
    return { ok: false, error: (data as { error?: string }).error };
  } catch {
    return { ok: false, error: NETWORK_ERROR };
  }
}

/** Approve / Reject / Suspend / Resume for one host, by its current status. */
export function GuestAiActions({ hostId, hostName, status }: { hostId: string; hostName: string | null; status: HostAiStatus }) {
  const router = useRouter();
  const [busy, setBusy] = useState<AdminAiAction | null>(null);
  const [confirm, setConfirm] = useState<AdminAiAction | null>(null);
  const host = hostName ?? "this host";

  const run = async (action: AdminAiAction) => {
    setBusy(action);
    const result = await send(hostId, { action });
    setBusy(null);
    setConfirm(null);
    if (result.ok) toast.success(`${DONE[action]}: ${host}`);
    else toast.error(result.error || actionFailed(`${action} this request`));
    // Refresh either way: on 409 another admin decided first.
    router.refresh();
  };

  const actions = ACTIONS_FOR[status];
  const dialog = confirm ? CONFIRM[confirm]?.(host) : null;

  return (
    <div className="flex gap-2">
      {actions.map((action, i) => (
        <Button
          key={action}
          size="sm"
          variant={i === 0 && (action === "approve" || action === "resume") ? "default" : "outline"}
          className="h-9 cursor-pointer whitespace-nowrap"
          disabled={busy !== null}
          onClick={() => (CONFIRM[action] ? setConfirm(action) : run(action))}
        >
          {busy === action && <Loader2 className="h-4 w-4 animate-spin" />}
          {LABEL[action]}
        </Button>
      ))}

      <Dialog open={dialog !== null} onOpenChange={(o) => !o && busy === null && setConfirm(null)}>
        {dialog && confirm && (
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{dialog.title}</DialogTitle>
              <DialogDescription>{dialog.body}</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button variant="outline" className="cursor-pointer" onClick={() => setConfirm(null)} disabled={busy !== null}>
                Cancel
              </Button>
              <Button variant="destructive" className="cursor-pointer" onClick={() => run(confirm)} disabled={busy !== null}>
                {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
                {LABEL[confirm]}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}

/** The host's daily reply cap, edited in its row. */
export function GuestAiCapField({ hostId, hostName, value }: { hostId: string; hostName: string | null; value: number }) {
  const router = useRouter();
  const id = useId();
  const [draft, setDraft] = useState(String(value));
  const [busy, setBusy] = useState(false);
  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= AI_REPLY_CAP_MAX;
  const changed = valid && n !== value;

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!changed) return;
    setBusy(true);
    const result = await send(hostId, { daily_reply_cap: n });
    setBusy(false);
    if (result.ok) toast.success(`Daily cap set to ${n}`);
    else toast.error(result.error || actionFailed("set the daily cap"));
    router.refresh();
  };

  return (
    <form onSubmit={save} className="flex items-center gap-2">
      <label htmlFor={id} className="sr-only">
        Daily reply cap for {hostName ?? "this host"}
      </label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        min={0}
        max={AI_REPLY_CAP_MAX}
        step={1}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        aria-invalid={!valid}
        className="h-9 w-20 tabular-nums"
      />
      {changed && (
        <Button type="submit" size="sm" variant="outline" className="h-9 cursor-pointer" disabled={busy}>
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save
        </Button>
      )}
    </form>
  );
}

/** The platform kill switch and daily cap over all hosts (migration 085). */
export function GuestAiPlatformControls({
  enabled,
  dailyCap,
  pricePerReply,
  repliesToday,
}: {
  enabled: boolean;
  dailyCap: number;
  pricePerReply: number;
  repliesToday: number;
}) {
  const router = useRouter();
  const id = useId();
  const [priceDraft, setPriceDraft] = useState(String(pricePerReply));
  const price = Number(priceDraft);
  const priceValid =
    priceDraft.trim() !== "" && Number.isFinite(price) && price >= 0 && price <= 100 && Math.abs(price * 100 - Math.round(price * 100)) < 1e-6;
  const [busy, setBusy] = useState(false);
  const [confirmOff, setConfirmOff] = useState(false);
  const [draft, setDraft] = useState(String(dailyCap));
  const n = Number(draft);
  const valid = draft.trim() !== "" && Number.isInteger(n) && n >= 0 && n <= 100_000;

  const update = async (body: { enabled?: boolean; daily_cap?: number; price_per_reply?: number }, done: string) => {
    setBusy(true);
    try {
      const r = await fetch("/api/admin/guest-ai/config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await r.json().catch(() => ({}));
      if (r.ok) toast.success(done);
      else toast.error((data as { error?: string }).error || actionFailed("update Guest AI"));
    } catch {
      toast.error(NETWORK_ERROR);
    } finally {
      setBusy(false);
      setConfirmOff(false);
      router.refresh();
    }
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-x-6 gap-y-3 rounded-xl border border-earth-100 bg-white px-4 py-3 text-sm">
      <p className="text-earth-800">
        <span className="font-semibold">{enabled ? "On for every approved host" : "Off for every host"}</span>
        <span className="ml-2 tabular-nums text-earth-600">
          Today {repliesToday} / {dailyCap} replies
        </span>
      </p>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (valid && n !== dailyCap) update({ daily_cap: n }, `Platform cap set to ${n}`);
        }}
      >
        <label htmlFor={id} className="text-earth-600">
          Daily cap, all hosts
        </label>
        <Input
          id={id}
          type="number"
          inputMode="numeric"
          min={0}
          max={100_000}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          aria-invalid={!valid}
          className="h-9 w-24 tabular-nums"
        />
        {valid && n !== dailyCap && (
          <Button type="submit" size="sm" variant="outline" className="h-9 cursor-pointer" disabled={busy}>
            Save
          </Button>
        )}
      </form>
      <form
        className="flex items-center gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (priceValid && price !== pricePerReply) update({ price_per_reply: price }, `Price set to ฿${price} a reply`);
        }}
      >
        <label htmlFor={`${id}-price`} className="text-earth-600">
          ฿ per reply (charged daily)
        </label>
        <Input
          id={`${id}-price`}
          type="number"
          inputMode="decimal"
          min={0}
          max={100}
          step={0.01}
          value={priceDraft}
          onChange={(e) => setPriceDraft(e.target.value)}
          aria-invalid={!priceValid}
          className="h-9 w-24 tabular-nums"
        />
        {priceValid && price !== pricePerReply && (
          <Button type="submit" size="sm" variant="outline" className="h-9 cursor-pointer" disabled={busy}>
            Save
          </Button>
        )}
      </form>
      <Button
        size="sm"
        variant={enabled ? "destructive" : "default"}
        className="ml-auto h-9 cursor-pointer"
        disabled={busy}
        onClick={() => (enabled ? setConfirmOff(true) : update({ enabled: true }, "Guest AI turned on"))}
      >
        {busy && <Loader2 className="h-4 w-4 animate-spin" />}
        {enabled ? "Turn off for everyone" : "Turn on"}
      </Button>

      <Dialog open={confirmOff} onOpenChange={(o) => !o && !busy && setConfirmOff(false)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Turn Guest AI off for every host?</DialogTitle>
            <DialogDescription>
              The assistant stops answering on every booking page at the next question. Hosts&apos; own settings stay
              as they are; turn it back on here.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setConfirmOff(false)} disabled={busy}>
              Cancel
            </Button>
            <Button variant="destructive" className="cursor-pointer" onClick={() => update({ enabled: false }, "Guest AI turned off")} disabled={busy}>
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              Turn off
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
