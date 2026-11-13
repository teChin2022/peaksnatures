import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { BeforeYouStaySection } from "@/components/booking/before-you-stay-section";

vi.mock("next-intl/server", () => ({
  getTranslations: async () => (key: string, values?: Record<string, unknown>) => (values ? `${key}:${Object.values(values).join(",")}` : key),
}));

const render = async (props: Partial<Parameters<typeof BeforeYouStaySection>[0]> = {}) =>
  renderToStaticMarkup(
    await BeforeYouStaySection({ checkInTime: "14:00", checkOutTime: "12:00", cancellationDays: 7, ...props }),
  );

describe("BeforeYouStaySection", () => {
  it("lists the stay times and the cancellation window", async () => {
    const html = await render();
    expect(html).toContain("checkInTime:14:00 · checkOutTime:12:00");
    expect(html).toContain("cancellationPolicyNote:7");
  });

  it("makes no cancellation promise the host didn't set", async () => {
    expect(await render({ cancellationDays: 0 })).not.toContain("cancellationPolicy");
  });

  it("leaves out stay times the host left empty", async () => {
    expect(await render({ checkInTime: null, checkOutTime: null })).not.toContain("stayTimes");
    expect(await render({ checkOutTime: null })).toContain("checkInTime:14:00<");
  });

  it("does not repeat how paying works: the booking card already says it", async () => {
    expect(await render()).not.toContain("howItWorks");
  });

  it("is left out when the host set neither", async () => {
    expect(await render({ checkInTime: null, checkOutTime: null, cancellationDays: 0 })).toBe("");
  });
});
