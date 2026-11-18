import { describe, expect, it } from "vitest";
import { adminSearchTerm, ilikeAny } from "./search-term";

describe("adminSearchTerm", () => {
  it("keeps what admins search by: names (Thai too), emails and phones", () => {
    expect(adminSearchTerm("  สมชาย  ใจดี ")).toBe("สมชาย ใจดี");
    expect(adminSearchTerm("guest.name+1@mail.co.th")).toBe("guest.name+1@mail.co.th");
    expect(adminSearchTerm("081-234-5678")).toBe("081-234-5678");
  });

  it("strips everything that is filter syntax or a LIKE wildcard", () => {
    expect(adminSearchTerm('a"),status.eq.paid,(x')).toBe("astatus.eq.paidx");
    expect(adminSearchTerm("50%*\\")).toBe("50");
  });

  it("refuses a term too short to search on", () => {
    expect(adminSearchTerm(null)).toBeNull();
    expect(adminSearchTerm("")).toBeNull();
    expect(adminSearchTerm(" a ")).toBeNull();
    expect(adminSearchTerm("%,()")).toBeNull();
  });

  it("caps the length", () => {
    expect(adminSearchTerm("x".repeat(500))).toHaveLength(100);
  });
});

describe("ilikeAny", () => {
  it("quotes the value so dots and commas stay inside it", () => {
    expect(ilikeAny(["guest_name", "guest_email"], "a.b@c.co")).toBe(
      'guest_name.ilike."%a.b@c.co%",guest_email.ilike."%a.b@c.co%"',
    );
  });
});
