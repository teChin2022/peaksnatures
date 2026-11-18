"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { fmtDate } from "@/lib/format-date";

interface Props {
  logId: string;
  hostName: string | null;
  settlement: { settled_at: string; settled_by_name: string; note: string | null } | null;
}

/** Mark a rejected payment settled, or undo that. Only a marker: it moves no money. */
export function SettleControl({ logId, hostName, settlement }: Props) {
  const router = useRouter();
  const [open, setOpen] = useState<"settle" | "undo" | null>(null);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async () => {
    setBusy(true);
    try {
      const r = await fetch(`/api/admin/payments/rejected/${logId}/settle`, {
        method: open === "undo" ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: open === "undo" ? undefined : JSON.stringify({ note: note.trim() || undefined }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) {
        toast.error(data.error || "Something went wrong");
      } else {
        toast.success(open === "undo" ? "Settled mark removed" : "Marked settled");
        setOpen(null);
        setNote("");
      }
      // Refresh either way: on 409 another admin settled it first.
      router.refresh();
    } catch {
      toast.error("Something went wrong");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {settlement ? (
        <div className="text-xs text-earth-600">
          <p className="flex items-center gap-1 font-medium text-brand">
            <CheckCircle className="h-3.5 w-3.5" aria-hidden />
            Settled
          </p>
          <p className="whitespace-nowrap">
            {fmtDate(new Date(settlement.settled_at), "MMM d, HH:mm", "en")} by {settlement.settled_by_name}
          </p>
          {settlement.note && <p className="mt-0.5 max-w-56 break-words text-earth-500">{settlement.note}</p>}
          <button
            type="button"
            onClick={() => setOpen("undo")}
            className="mt-1 cursor-pointer rounded text-earth-500 underline underline-offset-2 hover:text-brand focus:outline-none focus-visible:ring-2 focus-visible:ring-brand/40"
          >
            Undo
          </button>
        </div>
      ) : (
        <Button size="sm" variant="outline" className="h-9 cursor-pointer whitespace-nowrap" onClick={() => setOpen("settle")}>
          Mark settled
        </Button>
      )}

      <Dialog open={open !== null} onOpenChange={(o) => !o && !busy && setOpen(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{open === "undo" ? "Remove the settled mark?" : "Mark this payment settled?"}</DialogTitle>
            <DialogDescription>
              {open === "undo"
                ? "It will count as waiting again on this page and the overview."
                : `Only a record that ${hostName ?? "this host"}'s transfer has been dealt with. It does not top up a wallet, pay an invoice or refund anything: do that first.`}
            </DialogDescription>
          </DialogHeader>
          {open === "settle" && (
            <div className="space-y-2">
              <Label htmlFor={`settle-note-${logId}`}>Note (optional)</Label>
              <Textarea
                id={`settle-note-${logId}`}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                maxLength={500}
                placeholder="e.g. Topped up ฿450 by hand"
              />
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" className="cursor-pointer" onClick={() => setOpen(null)} disabled={busy}>
              Cancel
            </Button>
            <Button
              variant={open === "undo" ? "destructive" : "default"}
              className="cursor-pointer"
              onClick={submit}
              disabled={busy}
            >
              {busy && <Loader2 className="mr-1 h-4 w-4 animate-spin" />}
              {open === "undo" ? "Remove mark" : "Mark settled"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
