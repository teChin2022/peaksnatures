import { describe, expect, it } from "vitest";
import {
  ALLOWED_ATTACHMENT_TYPES,
  MAX_ATTACHMENT_BYTES,
  MAX_ATTACHMENTS_PER_BOOKING,
  attachmentExtension,
  buildAttachmentPath,
  countAttachmentsByBooking,
  mapSignedUrls,
  remainingAttachmentSlots,
  validateAttachmentUpload,
} from "@/lib/booking-attachments";

describe("attachmentExtension", () => {
  it("keeps an allowed extension the file already has, case-folded", () => {
    expect(attachmentExtension("shot.PNG", "image/png")).toBe("png");
    expect(attachmentExtension("shot.jpeg", "image/jpeg")).toBe("jpeg");
  });

  // compressImage() returns a .webp File after re-encoding, but hands back the
  // ORIGINAL file untouched when re-encoding would not shrink it. The caller
  // genuinely does not know which it holds, which is why the extension is read
  // off the file rather than hardcoded — the bug live in profile/page.tsx:137
  // and review-form-inline.tsx:163.
  it("keeps webp, so a compressed screenshot is not mislabelled", () => {
    expect(attachmentExtension("shot.webp", "image/webp")).toBe("webp");
  });

  it("derives from the MIME type when the name carries no extension", () => {
    expect(attachmentExtension("noextension", "image/jpeg")).toBe("jpg");
    expect(attachmentExtension("screenshot", "image/heic")).toBe("heic");
  });

  // The filename must never steer the stored path. /api/verify-slip takes
  // `file.name.split(".").pop()` with no allowlist; this is the same job done
  // safely.
  it("ignores a disallowed extension and falls back to the MIME type", () => {
    expect(attachmentExtension("shot.php", "image/png")).toBe("png");
    expect(attachmentExtension("shot.svg", "image/jpeg")).toBe("jpg");
  });

  it("falls back to jpg when neither the name nor the MIME type helps", () => {
    expect(attachmentExtension("shot.php", "application/octet-stream")).toBe("jpg");
  });

  it.each(["shot.", ".", "", "a/../evil"])(
    "yields a bare extension for the degenerate name %o",
    (name) => {
      expect(attachmentExtension(name, "image/jpeg")).toBe("jpg");
    },
  );

  it.each(["a/../evil.png", "../../etc/passwd.png", "%2e%2e/x.png"])(
    "never returns a path-ish fragment for %o",
    (name) => {
      const ext = attachmentExtension(name, "image/png");
      expect(ext).toBe("png");
      expect(ext).not.toMatch(/[/.%]/);
    },
  );
});

describe("buildAttachmentPath", () => {
  const base = {
    homestayId: "11111111-1111-1111-1111-111111111111",
    bookingId: "22222222-2222-2222-2222-222222222222",
    attachmentId: "33333333-3333-3333-3333-333333333333",
  };

  it("is {homestayId}/{bookingId}/{attachmentId}.{ext}", () => {
    expect(
      buildAttachmentPath({ ...base, fileName: "chat.png", mimeType: "image/png" }),
    ).toBe(`${base.homestayId}/${base.bookingId}/${base.attachmentId}.png`);
  });

  it("is exactly three segments even when the filename contains slashes", () => {
    const path = buildAttachmentPath({
      ...base,
      fileName: "../../evil.png",
      mimeType: "image/png",
    });
    expect(path.split("/")).toHaveLength(3);
    expect(path).not.toContain("..");
  });
});

describe("validateAttachmentUpload", () => {
  const ok = { size: 1024, type: "image/png", existingCount: 0 };

  it("accepts a normal screenshot", () => {
    expect(validateAttachmentUpload(ok)).toEqual({ ok: true });
  });

  it.each(ALLOWED_ATTACHMENT_TYPES)("accepts %s", (type) => {
    expect(validateAttachmentUpload({ ...ok, type })).toEqual({ ok: true });
  });

  it("rejects a type outside the allowlist", () => {
    expect(validateAttachmentUpload({ ...ok, type: "image/gif" })).toEqual({
      ok: false,
      reason: "INVALID_FILE_TYPE",
    });
  });

  // The boundary itself passes; one byte past it does not.
  it("accepts a file of exactly MAX_ATTACHMENT_BYTES", () => {
    expect(validateAttachmentUpload({ ...ok, size: MAX_ATTACHMENT_BYTES })).toEqual({
      ok: true,
    });
  });

  it("rejects one byte over MAX_ATTACHMENT_BYTES", () => {
    expect(validateAttachmentUpload({ ...ok, size: MAX_ATTACHMENT_BYTES + 1 })).toEqual({
      ok: false,
      reason: "FILE_TOO_LARGE",
    });
  });

  it("rejects an empty file", () => {
    expect(validateAttachmentUpload({ ...ok, size: 0 })).toEqual({
      ok: false,
      reason: "NO_FILE",
    });
  });

  it("accepts the last slot and rejects the one after it", () => {
    expect(
      validateAttachmentUpload({ ...ok, existingCount: MAX_ATTACHMENTS_PER_BOOKING - 1 }),
    ).toEqual({ ok: true });
    expect(
      validateAttachmentUpload({ ...ok, existingCount: MAX_ATTACHMENTS_PER_BOOKING }),
    ).toEqual({ ok: false, reason: "LIMIT_REACHED" });
  });

  // The cap is checked before anything about the file, so a host at the limit
  // gets "you have ten already" rather than a complaint about the file they
  // cannot store regardless.
  it("reports the limit ahead of a file problem", () => {
    expect(
      validateAttachmentUpload({
        size: MAX_ATTACHMENT_BYTES + 1,
        type: "image/gif",
        existingCount: MAX_ATTACHMENTS_PER_BOOKING,
      }),
    ).toEqual({ ok: false, reason: "LIMIT_REACHED" });
  });
});

describe("remainingAttachmentSlots", () => {
  it("counts down from the cap", () => {
    expect(remainingAttachmentSlots(0)).toBe(MAX_ATTACHMENTS_PER_BOOKING);
    expect(remainingAttachmentSlots(3)).toBe(MAX_ATTACHMENTS_PER_BOOKING - 3);
    expect(remainingAttachmentSlots(MAX_ATTACHMENTS_PER_BOOKING)).toBe(0);
  });

  // A negative slot count fed to Array.slice() takes from the END of the array
  // instead of taking nothing — the shape of the bug in rooms/page.tsx:331.
  it("never goes negative", () => {
    expect(remainingAttachmentSlots(MAX_ATTACHMENTS_PER_BOOKING + 3)).toBe(0);
  });
});

describe("countAttachmentsByBooking", () => {
  it("counts per booking", () => {
    expect(
      countAttachmentsByBooking([
        { booking_id: "a" },
        { booking_id: "b" },
        { booking_id: "a" },
      ]),
    ).toEqual({ a: 2, b: 1 });
  });

  it.each([[[]], [null], [undefined]])("maps %o to an empty object", (rows) => {
    expect(countAttachmentsByBooking(rows as { booking_id: string }[])).toEqual({});
  });

  // Bookings with nothing attached are ABSENT, not zero — the badge reads
  // `counts[id] ?? 0`, and materialising zeroes would mean passing the whole
  // booking-id list in just to get them.
  it("omits a booking that has no attachments", () => {
    const counts = countAttachmentsByBooking([{ booking_id: "a" }]);
    expect(counts).not.toHaveProperty("b");
    expect(counts["b"] ?? 0).toBe(0);
  });
});

describe("mapSignedUrls", () => {
  const rows = [
    { id: "1", storage_path: "h/b/1.png" },
    { id: "2", storage_path: "h/b/2.png" },
  ];

  it("zips positionally", () => {
    expect(
      mapSignedUrls(rows, [{ signedUrl: "https://x/1" }, { signedUrl: "https://x/2" }]),
    ).toEqual([
      { id: "1", storage_path: "h/b/1.png", signed_url: "https://x/1" },
      { id: "2", storage_path: "h/b/2.png", signed_url: "https://x/2" },
    ]);
  });

  // The three failure modes resolveSlipUrls (bookings/page.tsx:134) drops on the
  // floor. In each, every row must survive with signed_url null so the grid
  // renders a placeholder — rows must never vanish or slide by one index.
  it("keeps every row when the whole call failed", () => {
    const out = mapSignedUrls(rows, null);
    expect(out).toHaveLength(2);
    expect(out.every((r) => r.signed_url === null)).toBe(true);
    expect(out.map((r) => r.id)).toEqual(["1", "2"]);
  });

  it("nulls the tail when the result is shorter than the rows", () => {
    const out = mapSignedUrls(rows, [{ signedUrl: "https://x/1" }]);
    expect(out[0].signed_url).toBe("https://x/1");
    expect(out[1].signed_url).toBeNull();
  });

  it("nulls a single failed entry without disturbing its neighbours", () => {
    const out = mapSignedUrls(rows, [{ signedUrl: null }, { signedUrl: "https://x/2" }]);
    expect(out[0].signed_url).toBeNull();
    expect(out[1].signed_url).toBe("https://x/2");
  });

  it("maps no rows to no rows", () => {
    expect(mapSignedUrls([], null)).toEqual([]);
  });
});
