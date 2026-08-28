import { describe, expect, it } from "vitest";
import { cn, getInitials, isValidEmail, isValidPhone, sanitizePhoneInput } from "@/lib/utils";

describe("cn", () => {
  it("joins class names", () => {
    expect(cn("rounded", "border")).toBe("rounded border");
  });

  it("lets a later Tailwind class win over an earlier conflicting one", () => {
    expect(cn("p-2", "p-4")).toBe("p-4");
  });

  it("drops falsy values", () => {
    expect(cn("a", false, null, undefined, "", "b")).toBe("a b");
  });
});

describe("getInitials", () => {
  it("takes the first letter of the first two words, uppercased", () => {
    expect(getInitials("somchai jaidee")).toBe("SJ");
    expect(getInitials("Somchai Jaidee Wong")).toBe("SJ");
  });

  it("handles a single word", () => {
    expect(getInitials("Somchai")).toBe("S");
  });

  it("ignores surrounding and repeated whitespace", () => {
    expect(getInitials("   somchai    jaidee  ")).toBe("SJ");
  });

  it("returns an empty string for an empty or whitespace-only name", () => {
    expect(getInitials("")).toBe("");
    expect(getInitials("   ")).toBe("");
  });
});

describe("isValidEmail", () => {
  it("accepts ordinary addresses", () => {
    for (const value of ["a@b.co", "guest@peaksnature.com", "first.last+tag@sub.example.co.th"]) {
      expect(isValidEmail(value)).toBe(true);
    }
  });

  it("trims before validating", () => {
    expect(isValidEmail("  guest@peaksnature.com  ")).toBe(true);
  });

  it("rejects addresses with no domain dot, no user, no domain or spaces inside", () => {
    for (const value of ["a@b", "@b.co", "a@", "plainstring", "a b@c.co", "a@b .co", ""]) {
      expect(isValidEmail(value)).toBe(false);
    }
  });
});

describe("sanitizePhoneInput", () => {
  it("strips everything that is not a digit", () => {
    expect(sanitizePhoneInput("081-234-5678")).toBe("0812345678");
    expect(sanitizePhoneInput("(081) 234 5678")).toBe("0812345678");
  });

  it("truncates to ten digits", () => {
    expect(sanitizePhoneInput("08123456789999")).toBe("0812345678");
  });

  it("drops a leading + so an international number loses its country code prefix", () => {
    expect(sanitizePhoneInput("+66812345678")).toBe("6681234567");
  });

  it("returns an empty string when there are no digits", () => {
    expect(sanitizePhoneInput("abc-def")).toBe("");
  });
});

describe("isValidPhone", () => {
  it("accepts exactly ten digits", () => {
    expect(isValidPhone("0812345678")).toBe(true);
  });

  it("rejects anything shorter, longer or non-numeric", () => {
    for (const value of ["081234567", "08123456789", "081-234-5678", "+66812345678", ""]) {
      expect(isValidPhone(value)).toBe(false);
    }
  });
});
