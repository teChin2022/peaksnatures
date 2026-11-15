import { describe, expect, it } from "vitest";
import { slipStoragePath } from "./slip-path";

describe("slipStoragePath", () => {
  it("returns a plain storage path as it is", () => {
    expect(slipStoragePath("pending/abc/slip.jpg")).toBe("pending/abc/slip.jpg");
  });

  it("pulls the path out of a legacy signed URL", () => {
    expect(
      slipStoragePath("https://x.supabase.co/storage/v1/object/sign/payment-slips/pending/a%20b/slip.jpg?token=t"),
    ).toBe("pending/a b/slip.jpg");
  });

  it.each([null, "", "https://example.com/not-a-slip.jpg"])("has no path for %j", (value) => {
    expect(slipStoragePath(value)).toBeNull();
  });
});
