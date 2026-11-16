// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PASSWORD_RE } from "@/lib/utils";

const h = vi.hoisted(() => ({ toastSuccess: vi.fn(), toastError: vi.fn() }));

// Keys and their values stand in for the copy: this tests what is shown, not its wording.
vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, string | number>) =>
    values ? `${key}:${Object.values(values).join(",")}` : key,
  useLocale: () => "th",
}));
vi.mock("sonner", () => ({ toast: { success: h.toastSuccess, error: h.toastError } }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ auth: { getUser: async () => ({ data: { user: { email: "owner@example.com" } } }) } }),
}));

import { StaffCard, generateStaffPassword, initialOf, staffErrorKey, type StaffRow } from "./staff-card";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const STAFF_ID = "5f0b6f0e-1111-4111-8111-111111111111";
const noi: StaffRow = { id: STAFF_ID, name: "Noi", email: "noi@example.com", created_at: "2026-11-16T03:00:00Z" };

let container: HTMLDivElement;
let root: Root;
let fetchMock: ReturnType<typeof vi.fn>;
let writeText: ReturnType<typeof vi.fn>;

const ok = (body: unknown) => ({ ok: true, status: 200, json: async () => body });
const refused = (status: number, error: string) => ({ ok: false, status, json: async () => ({ error }) });

async function render(staff: StaffRow[] | null = [noi]) {
  fetchMock.mockResolvedValueOnce(staff ? ok({ staff }) : refused(500, "x"));
  await act(async () => root.render(createElement(StaffCard)));
  await act(async () => {});
}

const button = (text: string) =>
  [...document.querySelectorAll("button")].find((b) => b.textContent?.trim() === text) ?? null;
const byLabel = (label: string) => {
  const el = [...document.querySelectorAll("label")].find((l) => l.textContent === label);
  return el ? (document.getElementById(el.htmlFor) as HTMLInputElement) : null;
};
const errorFor = (label: string) => {
  const input = byLabel(label);
  return input ? document.getElementById(`${input.id}-error`)?.textContent ?? null : null;
};
const click = async (el: Element | null) => {
  if (!el) throw new Error("element not found");
  await act(async () => (el as HTMLElement).click());
};
const type = async (label: string, value: string) => {
  const input = byLabel(label);
  if (!input) throw new Error(`no field labelled ${label}`);
  const setValue = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
  await act(async () => {
    setValue.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
};
const submit = async () => {
  const form = document.querySelector("[role=dialog] form");
  if (!form) throw new Error("no dialog form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await act(async () => {});
};
/** Open a row's "⋯" menu (by keyboard, as the trigger supports) and pick an item. */
const rowAction = async (name: string, item: "resetPassword" | "confirmRemove") => {
  const trigger = container.querySelector(`[aria-label="rowMenuAria:${name}"]`) as HTMLElement | null;
  if (!trigger) throw new Error(`no menu for ${name}`);
  await act(async () => {
    trigger.focus();
    trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
  });
  const menuItem = [...document.querySelectorAll("[role=menuitem]")].find((el) => el.textContent?.trim() === item);
  await click(menuItem ?? null);
};
const fillAdd = async (password = "Staff_2026") => {
  await click(button("add"));
  await type("name", "Ploy");
  await type("email", "ploy@example.com");
  await type("password", password);
  await type("ownerPassword", "Owner#2026");
};

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
  writeText = vi.fn().mockResolvedValue(undefined);
  Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
  h.toastSuccess.mockReset();
  h.toastError.mockReset();
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  vi.unstubAllGlobals();
});

describe("StaffCard: the list", () => {
  it("shows each login as a person, with the count and one menu named for them", async () => {
    await render();

    expect(fetchMock).toHaveBeenCalledWith("/api/host/staff");
    expect(container.querySelector("h1")?.textContent).toBe("title");
    expect(container.textContent).toContain("count:1,10");
    expect(container.textContent).toContain("noi@example.com");
    expect(container.querySelector("li [aria-hidden]")?.textContent).toBe("N");
    expect(container.querySelector('[aria-label="rowMenuAria:Noi"]')).not.toBeNull();
    expect(button("add")).not.toBeNull();
  });

  it("offers reset and remove from the row's menu", async () => {
    await render();
    await act(async () => {
      const trigger = container.querySelector('[aria-label="rowMenuAria:Noi"]') as HTMLElement;
      trigger.focus();
      trigger.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true }));
    });
    const items = [...document.querySelectorAll("[role=menuitem]")].map((el) => el.textContent?.trim());
    expect(items).toEqual(["resetPassword", "confirmRemove"]);
  });

  it("announces the loading state", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => root.render(createElement(StaffCard)));
    expect(container.querySelector("[role=status]")?.textContent).toBe("loading");
  });

  it("shows an empty state with a way to add the first login", async () => {
    await render([]);
    expect(container.textContent).toContain("emptyTitle");
    expect(button("add")?.disabled).toBe(false);
  });

  it("stops adding at the limit of 10", async () => {
    await render(Array.from({ length: 10 }, (_, i) => ({ ...noi, id: `id-${i}`, name: `Staff ${i}` })));
    expect(container.textContent).toContain("limitReached:10");
    expect(button("add")).toBeNull();
  });

  it("offers a retry when the list cannot load", async () => {
    await render(null);
    expect(container.textContent).toContain("errorLoad");

    fetchMock.mockResolvedValueOnce(ok({ staff: [noi] }));
    await click(button("retry"));
    await act(async () => {});

    expect(container.textContent).toContain("noi@example.com");
  });
});

describe("StaffCard: adding a login", () => {
  it("sends the details, then shows them once to pass on, and reloads the list", async () => {
    await render([]);
    await fillAdd();
    fetchMock.mockResolvedValueOnce(ok({ staff: { id: "new" } })).mockResolvedValueOnce(ok({ staff: [noi] }));

    await submit();

    expect(fetchMock).toHaveBeenCalledWith("/api/host/staff", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: "Ploy", email: "ploy@example.com", password: "Staff_2026", ownerPassword: "Owner#2026" }),
    });
    const dialog = document.querySelector("[role=dialog]");
    expect(dialog?.textContent).toContain("doneTitle:Ploy");
    expect(dialog?.textContent).toContain("ploy@example.com");
    expect(dialog?.textContent).toContain("Staff_2026");
    expect(container.textContent).toContain("noi@example.com");
  });

  it("copies the login link, email and password in one go", async () => {
    await render([]);
    await fillAdd();
    fetchMock.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok({ staff: [] }));
    await submit();

    await click(button("copyAll"));

    expect(writeText).toHaveBeenCalledWith(`copyText:${location.origin}/login,ploy@example.com,Staff_2026`);
    expect(button("copied")).not.toBeNull();
  });

  // A stray tap or Esc must not lose the only view of the password.
  it("closes the summary only with Done", async () => {
    await render([]);
    await fillAdd();
    fetchMock.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok({ staff: [] }));
    await submit();
    const dialog = document.querySelector("[role=dialog]")!;
    expect(dialog.textContent).toContain("otpNote");
    expect(dialog.querySelector('[data-slot="dialog-close"]')).toBeNull();

    await act(async () => {
      dialog.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true, cancelable: true }));
    });
    expect(document.querySelector("[role=dialog]")).not.toBeNull();

    await click(button("done"));
    expect(document.querySelector("[role=dialog]")).toBeNull();
  });

  it("says so when the copy fails, leaving the details on screen", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    await render([]);
    await fillAdd();
    fetchMock.mockResolvedValueOnce(ok({})).mockResolvedValueOnce(ok({ staff: [] }));
    await submit();

    await click(button("copyAll"));

    expect(h.toastError).toHaveBeenCalledWith("copyFailed");
    expect(document.querySelector("[role=dialog]")?.textContent).toContain("Staff_2026");
  });

  // The owner should only ever type their own password (testing showed the
  // owner field read as "confirm the staff password").
  it("starts with a generated staff password, and can make a new one", async () => {
    await render([]);
    await click(button("add"));
    const first = byLabel("password")!.value;
    expect(first).toMatch(PASSWORD_RE);

    await click(button("generate"));

    expect(byLabel("password")!.value).toMatch(PASSWORD_RE);
    expect(byLabel("password")!.value).not.toBe(first);
  });

  it("says whose password the owner field wants, before the field", async () => {
    await render([]);
    await click(button("add"));
    const owner = byLabel("ownerPassword")!;
    const hint = document.getElementById(`${owner.id}-hint`);
    expect(hint?.textContent).toBe("ownerPasswordHint:owner@example.com");
    expect(owner.getAttribute("aria-describedby")).toContain(`${owner.id}-hint`);
    expect(hint!.compareDocumentPosition(owner) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("catches the staff password typed into the owner field without asking the server", async () => {
    await render([]);
    await fillAdd();
    await type("ownerPassword", "Staff_2026");

    await submit();

    expect(errorFor("ownerPassword")).toBe("errorOwnerSameAsStaff");
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the list
  });

  it("keeps the staff password out of password managers", async () => {
    await render([]);
    await click(button("add"));
    const input = byLabel("password")!;
    expect(input.type).toBe("text");
    expect(input.autocomplete).toBe("off");
    expect(byLabel("ownerPassword")?.autocomplete).toBe("current-password");
  });

  it("names every missing field under it and sends nothing", async () => {
    await render([]);
    await click(button("add"));

    await submit();

    expect(errorFor("name")).toBe("errorNameRequired");
    expect(errorFor("email")).toBe("errorEmailInvalid");
    expect(errorFor("password")).toBeNull(); // pre-generated
    expect(errorFor("ownerPassword")).toBe("errorOwnerPasswordRequired");
    expect(byLabel("name")?.getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(byLabel("name"));
    expect(fetchMock).toHaveBeenCalledTimes(1); // only the list
  });

  it("checks the password rule before sending anything", async () => {
    await render([]);
    await fillAdd("password1");

    await submit();

    expect(errorFor("password")).toBe("errorPasswordRule");
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("puts a taken email under the email field", async () => {
    await render([]);
    await fillAdd();
    fetchMock.mockResolvedValueOnce(refused(409, "EMAIL_IN_USE"));

    await submit();

    expect(errorFor("email")).toBe("errorEmailInUse");
    expect(byLabel("email")?.getAttribute("aria-describedby")).toContain(`${byLabel("email")!.id}-error`);
    expect(document.activeElement).toBe(byLabel("email"));
    expect(document.querySelector("[role=dialog]")).not.toBeNull();
  });
});

describe("StaffCard: resetting a password", () => {
  it("sends the pre-generated password with the owner's", async () => {
    await render();
    await rowAction("Noi", "resetPassword");
    const generated = byLabel("newPassword")!.value;
    expect(document.activeElement).toBe(byLabel("ownerPassword"));
    await type("ownerPassword", "Owner#2026");
    fetchMock.mockResolvedValueOnce(ok({ success: true })).mockResolvedValueOnce(ok({ staff: [noi] }));

    await submit();

    expect(fetchMock).toHaveBeenCalledWith(`/api/host/staff/${STAFF_ID}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password: generated, ownerPassword: "Owner#2026" }),
    });
    expect(document.querySelector("[role=dialog]")?.textContent).toContain(generated);
  });
});

describe("StaffCard: removing a login", () => {
  const openRemove = async () => {
    await render();
    await rowAction("Noi", "confirmRemove");
    await type("ownerPassword", "Owner#2026");
  };

  it("sends only the owner's password to that login's address", async () => {
    await openRemove();
    fetchMock.mockResolvedValueOnce(ok({ success: true })).mockResolvedValueOnce(ok({ staff: [] }));

    await submit();

    expect(fetchMock).toHaveBeenCalledWith(`/api/host/staff/${STAFF_ID}`, {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ownerPassword: "Owner#2026" }),
    });
    expect(h.toastSuccess).toHaveBeenCalledWith("removed:Noi");
    expect(document.querySelector("[role=dialog]")).toBeNull();
    expect(container.textContent).toContain("empty");
  });

  it("clears a wrong owner password and says why under the field", async () => {
    await openRemove();
    fetchMock.mockResolvedValueOnce(refused(403, "WRONG_PASSWORD"));

    await submit();

    expect(errorFor("ownerPassword")).toBe("errorWrongPassword");
    expect(byLabel("ownerPassword")?.value).toBe("");
    expect(document.activeElement).toBe(byLabel("ownerPassword"));
  });

  it("reloads the list when the login was already removed elsewhere", async () => {
    await openRemove();
    fetchMock.mockResolvedValueOnce(refused(404, "Staff not found")).mockResolvedValueOnce(ok({ staff: [] }));

    await submit();

    expect(document.querySelector("[role=dialog] [role=alert]")?.textContent).toBe("errorGone");
    expect(fetchMock).toHaveBeenLastCalledWith("/api/host/staff");
  });
});

describe("staffErrorKey", () => {
  it.each([
    [429, "anything", "errorTooMany"],
    [404, "Staff not found", "errorGone"],
    [403, "WRONG_PASSWORD", "errorWrongPassword"],
    [409, "EMAIL_IN_USE", "errorEmailInUse"],
    [409, "STAFF_LIMIT", "limitReached"],
    [400, "INVALID_INPUT", "errorInvalid"],
    [500, "Failed to add staff", "errorGeneric"],
  ])("maps %i %s to %s", (status, code, key) => {
    expect(staffErrorKey(status, code)).toBe(key);
  });
});

describe("generateStaffPassword", () => {
  it("always meets the sign-up rule and has no look-alike characters", () => {
    for (let i = 0; i < 500; i++) {
      const pw = generateStaffPassword();
      expect(pw).toHaveLength(12);
      expect(pw).toMatch(PASSWORD_RE);
      expect(pw).not.toMatch(/[0O1lI]/);
    }
  });
});

describe("initialOf", () => {
  it.each([
    ["Noi", "N"],
    ["noi", "N"],
    ["น้อย", "น"],
    ["เอก", "อ"],
    ["  ไก่ทอง", "ก"],
    ["", "?"],
  ])("shows %j as %j", (name, initial) => {
    expect(initialOf(name)).toBe(initial);
  });
});
