import { describe, expect, it } from "vitest";
import { cancellationNote } from "@/lib/cancellation-note";

// Local dates, as the date picker hands them over (check-in at local midnight).
const checkIn = new Date(2026, 11, 20); // 20 Dec 2026

describe("cancellationNote", () => {
  it("says guests cannot cancel online when the host set 0 days", () => {
    expect(cancellationNote(0, checkIn, "2026-11-17")).toEqual({ kind: "none" });
  });

  it("gives the last free day, check-in minus N", () => {
    const note = cancellationNote(3, checkIn, "2026-11-17");
    expect(note.kind).toBe("free");
    expect(note.kind === "free" && note.deadline).toEqual(new Date(2026, 11, 17));
  });

  it("still counts the deadline day itself as free, like the cancel route", () => {
    // 3 days before 20 Dec is 17 Dec: on 17 Dec the route still allows it.
    expect(cancellationNote(3, checkIn, "2026-12-17").kind).toBe("free");
  });

  it("says the free window has passed from the day after the deadline", () => {
    expect(cancellationNote(3, checkIn, "2026-12-18")).toEqual({ kind: "passed", days: 3 });
  });
});
