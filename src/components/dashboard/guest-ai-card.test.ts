// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));

// Keys and their values stand in for the copy: this tests what is shown, not its wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "th",
}));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));

import { GuestAiCard, type GuestAiSettings } from "./guest-ai-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const APPROVED: GuestAiSettings = {
  host_id: "host-1",
  status: "approved",
  requested_at: "2026-11-19T03:00:00Z",
  decided_at: "2026-11-19T04:00:00Z",
  enabled: false,
  can_answer: true,
  can_set_dates: true,
  can_suggest_houses: true,
  can_navigate: true,
  instructions: null,
  daily_reply_cap: 50,
};

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;

const ok = (body: unknown, status = 200) => ({ ok: true, status, json: async () => body });
const refused = (status: number) => ({ ok: false, status, json: async () => ({ error: "x" }) });

async function render(settings: GuestAiSettings | null | "error") {
  fetchMock.mockResolvedValueOnce(settings === "error" ? refused(500) : ok({ settings }));
  await act(async () => root.render(createElement(GuestAiCard)));
  await act(async () => {});
}

const text = () => container.textContent ?? "";
const button = (label: string) =>
  [...container.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) ?? null;
const switchFor = (label: string) => {
  const l = [...container.querySelectorAll("label")].find((el) => el.textContent?.includes(label));
  return l ? (container.querySelector(`#${CSS.escape(l.htmlFor)}`) as HTMLButtonElement) : null;
};
const click = async (el: Element | null) => {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
  await act(async () => {});
};
const lastCall = () => fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as [string, RequestInit | undefined];

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("GuestAiCard", () => {
  it("offers the request before the host ever asked, and shows the wait after sending it", async () => {
    await render(null);
    expect(text()).toContain("noneTitle");

    fetchMock.mockResolvedValueOnce(ok({ settings: { ...APPROVED, status: "requested", decided_at: null } }, 201));
    await click(button("request"));

    expect(lastCall()).toEqual(["/api/host/ai-admin", { method: "POST" }]);
    expect(text()).toContain("requestedTitle");
    expect(h.toastSuccess).toHaveBeenCalledWith("requestSent");
  });

  it("offers a new request after a rejection, and only an explanation while suspended", async () => {
    await render({ ...APPROVED, status: "rejected" });
    expect(button("requestAgain")).not.toBeNull();

    act(() => root.unmount());
    root = createRoot(container);
    await render({ ...APPROVED, status: "suspended" });
    expect(text()).toContain("suspendedTitle");
    expect(button("requestAgain")).toBeNull();
    expect(container.querySelector('[role="switch"]')).toBeNull();
  });

  it("shows what a reply costs, or that the trial is free (086)", async () => {
    fetchMock.mockResolvedValueOnce(ok({ settings: APPROVED, pricePerReply: 0.5 }));
    await act(async () => root.render(createElement(GuestAiCard)));
    await act(async () => {});
    expect(text()).toContain("priceLine:0.50");

    act(() => root.unmount());
    root = createRoot(container);
    await render(APPROVED);
    expect(text()).toContain("priceFree");
  });

  it("shows the admin's daily cap and saves a switch at once", async () => {
    await render(APPROVED);
    expect(text()).toContain("capLine:50");

    fetchMock.mockResolvedValueOnce(ok({ settings: { ...APPROVED, enabled: true } }));
    await click(switchFor("enabledLabel"));

    const [url, init] = lastCall();
    expect(url).toBe("/api/host/ai-admin");
    expect(init?.method).toBe("PATCH");
    expect(JSON.parse(init?.body as string)).toEqual({ enabled: true });
    expect(switchFor("enabledLabel")?.getAttribute("aria-checked")).toBe("true");
  });

  it("puts a switch back when the save fails", async () => {
    await render(APPROVED);
    fetchMock.mockResolvedValueOnce(refused(500));
    await click(switchFor("canSetDates"));

    expect(switchFor("canSetDates")?.getAttribute("aria-checked")).toBe("true");
    expect(h.toastError).toHaveBeenCalledWith("errorSave");
  });

  it("saves the notes only when they changed, trimmed", async () => {
    await render(APPROVED);
    const save = button("save") as HTMLButtonElement;
    expect(save.disabled).toBe(true);

    const area = container.querySelector("textarea") as HTMLTextAreaElement;
    const setValue = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setValue.call(area, "  จอดรถได้ 3 คัน  ");
      area.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(save.disabled).toBe(false);

    fetchMock.mockResolvedValueOnce(ok({ settings: { ...APPROVED, instructions: "จอดรถได้ 3 คัน" } }));
    await act(async () => save.closest("form")!.requestSubmit());
    await act(async () => {});
    expect(JSON.parse(lastCall()[1]?.body as string)).toEqual({ instructions: "จอดรถได้ 3 คัน" });
    expect(h.toastSuccess).toHaveBeenCalledWith("saved");
  });

  it("offers a retry when the page cannot load", async () => {
    await render("error");
    expect(container.querySelector('[role="alert"]')?.textContent).toContain("errorLoad");
    fetchMock.mockResolvedValueOnce(ok({ settings: null }));
    await click(button("retry"));
    expect(text()).toContain("noneTitle");
  });
});
