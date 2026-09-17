"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import { useTranslations } from "next-intl";
import { ImagePlus, Loader2, Lock, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { compressImage } from "@/lib/compress-image";
import {
  ATTACHMENTS_BUCKET,
  ATTACHMENT_SIGNED_URL_TTL_SECONDS,
  MAX_ATTACHMENTS_PER_BOOKING,
  MAX_ATTACHMENT_BYTES,
  mapSignedUrls,
  remainingAttachmentSlots,
  validateAttachmentUpload,
  type AttachmentRejectReason,
} from "@/lib/booking-attachments";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface AttachmentRow {
  id: string;
  storage_path: string;
  created_at: string;
}

type Attachment = AttachmentRow & { signed_url: string | null };

interface BookingAttachmentsProps {
  bookingId: string;
  /** Lets the parent keep its card badge in step without refetching the page. */
  onCountChange?: (bookingId: string, count: number) => void;
}

/**
 * Host-private chat screenshots for one booking.
 *
 * Reads come straight from the browser under the RLS policy in migration 068;
 * writes go through /api/bookings/attachments, which is the only thing allowed
 * to touch the bucket. See that route for why the write is not done here.
 */
export function BookingAttachments({ bookingId, onCountChange }: BookingAttachmentsProps) {
  const t = useTranslations("dashboard");
  const tc = useTranslations("common");

  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Attachment | null>(null);
  const [deleting, setDeleting] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const report = useCallback(
    (rows: Attachment[]) => {
      setAttachments(rows);
      onCountChange?.(bookingId, rows.length);
    },
    [bookingId, onCountChange],
  );

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      const supabase = createClient();
      const { data } = await supabase
        .from("booking_attachments")
        .select("id, storage_path, created_at")
        .eq("booking_id", bookingId)
        .order("created_at", { ascending: true });

      const rows = (data as AttachmentRow[] | null) ?? [];
      if (rows.length === 0) {
        if (!cancelled) {
          setAttachments([]);
          setLoading(false);
        }
        return;
      }

      // One batch for the whole grid, the same shape the bookings page uses for
      // slips. mapSignedUrls keeps every row even when the batch comes back
      // short or null, so a signing failure shows placeholders rather than
      // silently dropping images the host knows they uploaded.
      const { data: signed } = await supabase.storage
        .from(ATTACHMENTS_BUCKET)
        .createSignedUrls(
          rows.map((r) => r.storage_path),
          ATTACHMENT_SIGNED_URL_TTL_SECONDS,
        );

      if (cancelled) return;
      setAttachments(mapSignedUrls(rows, signed));
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, [bookingId]);

  const rejectMessage = (reason: AttachmentRejectReason | string) => {
    switch (reason) {
      case "LIMIT_REACHED":
        return t("attachmentsLimitReached", { max: MAX_ATTACHMENTS_PER_BOOKING });
      case "FILE_TOO_LARGE":
        return t("attachmentsTooLarge", {
          max: Math.floor(MAX_ATTACHMENT_BYTES / (1024 * 1024)),
        });
      case "INVALID_FILE_TYPE":
        return t("attachmentsInvalidType");
      default:
        return t("attachmentsUploadError");
    }
  };

  const handleSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setUploading(true);
    const added: Attachment[] = [];

    try {
      // Sequential, and sliced to what actually fits — the same shape as the
      // room gallery uploader. remainingAttachmentSlots() is clamped at zero, so
      // a host already at the cap slices nothing rather than slicing from the
      // end of the list.
      const room = remainingAttachmentSlots(attachments.length);
      if (room === 0) {
        toast.error(rejectMessage("LIMIT_REACHED"));
        return;
      }
      const picked = Array.from(files).slice(0, room);
      if (picked.length < files.length) {
        toast.error(rejectMessage("LIMIT_REACHED"));
      }

      for (const [index, file] of picked.entries()) {
        // compressImage throws on an image the browser cannot decode (HEIC with
        // no decoder) and returns the ORIGINAL file when re-encoding would not
        // shrink it. Both are fine — send what we have, exactly as prepareSlip
        // does for payment slips. A compression failure must not cost the host
        // the attachment.
        let prepared = file;
        try {
          prepared = await compressImage(file, { maxDimension: 1920, quality: 0.85 });
        } catch {
          prepared = file;
        }

        // Re-validate after compression: the file may be the untouched original.
        const check = validateAttachmentUpload({
          size: prepared.size,
          type: prepared.type,
          existingCount: attachments.length + added.length,
        });
        if (!check.ok) {
          toast.error(rejectMessage(check.reason));
          continue;
        }

        const form = new FormData();
        form.append("booking_id", bookingId);
        form.append("file", prepared);

        const res = await fetch("/api/bookings/attachments", { method: "POST", body: form });
        const body = await res.json().catch(() => ({}));

        if (!res.ok) {
          toast.error(rejectMessage(body?.reason ?? ""));
          // A rejected file is that file's problem; a full booking or a rate
          // limit ends the batch, since every remaining file would fail too.
          if (body?.reason === "LIMIT_REACHED" || res.status === 429) break;
          continue;
        }

        added.push(body.attachment as Attachment);
        if (index === picked.length - 1) toast.success(t("attachmentsTitle"));
      }
    } finally {
      if (added.length > 0) report([...attachments, ...added]);
      setUploading(false);
      // Without this, re-picking the same file fires no change event.
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const handleDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/bookings/attachments/${pendingDelete.id}`, {
        method: "DELETE",
      });
      if (!res.ok) {
        toast.error(t("attachmentsRemoveError"));
        return;
      }
      report(attachments.filter((a) => a.id !== pendingDelete.id));
      setPendingDelete(null);
    } finally {
      setDeleting(false);
    }
  };

  const full = remainingAttachmentSlots(attachments.length) === 0;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <h4 className="flex items-center gap-1.5 text-sm font-medium text-gray-700">
          <ImagePlus className="h-4 w-4" />
          {t("attachmentsTitle")}
          {attachments.length > 0 && (
            <span className="text-xs font-normal text-gray-400">
              {t("attachmentsCount", {
                count: attachments.length,
                max: MAX_ATTACHMENTS_PER_BOOKING,
              })}
            </span>
          )}
        </h4>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={uploading || full}
          onClick={() => inputRef.current?.click()}
        >
          {uploading ? (
            <>
              <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />
              {t("attachmentsUploading")}
            </>
          ) : (
            t("attachmentsAdd")
          )}
        </Button>
      </div>

      {/* The privacy promise belongs at the moment of upload — the host is about
          to paste a guest's conversation — not buried in a policy page. */}
      <p className="flex items-center gap-1 text-xs text-gray-400">
        <Lock className="h-3 w-3" />
        {t("attachmentsPrivateHint")}
      </p>

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={handleSelect}
      />

      {loading ? (
        <div className="flex items-center justify-center rounded-lg border border-dashed border-gray-200 p-4">
          <Loader2 className="h-4 w-4 animate-spin text-gray-300" />
        </div>
      ) : attachments.length === 0 ? (
        <div className="flex items-center gap-2 rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-400">
          <ImagePlus className="h-5 w-5" />
          {t("attachmentsEmpty")}
        </div>
      ) : (
        // aspect-[3/4], not the gallery's 4/3: phone chat screenshots are
        // portrait, and a landscape tile letterboxes every one of them.
        <div className="grid grid-cols-3 gap-2">
          {attachments.map((attachment) => (
            <div
              key={attachment.id}
              className="group relative aspect-[3/4] overflow-hidden rounded-lg border bg-gray-50"
            >
              {attachment.signed_url ? (
                // rel="noreferrer" is load-bearing, not boilerplate: a signed
                // URL is a credential in a query string and must not travel to
                // the opened page as a Referer header.
                <a
                  href={attachment.signed_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="block h-full w-full"
                >
                  <Image
                    src={attachment.signed_url}
                    alt={t("attachmentsAlt")}
                    fill
                    sizes="(max-width: 640px) 33vw, 160px"
                    className="h-full w-full object-cover"
                  />
                </a>
              ) : (
                <div className="flex h-full w-full items-center justify-center">
                  <ImagePlus className="h-5 w-5 text-gray-300" />
                </div>
              )}
              {/* Always visible on touch, hover-revealed on a fine pointer. A
                  hover-only overlay makes delete unreachable on a phone. */}
              <button
                type="button"
                aria-label={t("attachmentsRemove")}
                onClick={() => setPendingDelete(attachment)}
                className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-100 transition-opacity pointer-fine:opacity-0 pointer-fine:group-hover:opacity-100"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
        </div>
      )}

      <Dialog open={pendingDelete !== null} onOpenChange={(open) => !open && setPendingDelete(null)}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-4 w-4 text-red-500" />
              {t("attachmentsRemove")}
            </DialogTitle>
            <DialogDescription className="text-sm text-gray-600">
              {tc("confirmRemoveImage")}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="flex gap-2 sm:justify-end">
            <Button variant="outline" onClick={() => setPendingDelete(null)} disabled={deleting}>
              {tc("cancel")}
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {tc("delete")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
