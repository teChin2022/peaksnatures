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

import { StaffCard, generateStaffPassword, staffErrorKey, type StaffRow } from "./staff-card";

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
  it("shows each staff login in full, with labelled actions named for it", async () => {
    await render();

    expect(fetchMock).toHaveBeenCalledWith("/api/host/staff");
    expect(container.textContent).toContain("noi@example.com");
    const reset = container.querySelector('[aria-label="resetAria:Noi"]');
    const remove = container.querySelector('[aria-label="removeAria:Noi"]');
    expect(reset?.textContent).toBe("resetPassword");
    expect(remove?.textContent).toBe("remove");
  });

  it("announces the loading state", async () => {
    fetchMock.mockReturnValueOnce(new Promise(() => {}));
    await act(async () => root.render(createElement(StaffCard)));
    expect(container.querySelector("[role=status]")?.textContent).toBe("loading");
  });

  it("says so when there is nobody yet", async () => {
    await render([]);
    expect(container.textContent).toContain("empty");
    expect(button("add")?.disabled).toBe(false);
  });

  it("stops adding at the limit of 10", async () => {
    await render(Array.from({ length: 10 }, (_, i) => ({ ...noi, id: `id-${i}`, name: `Staff ${i}` })));
    expect(container.textContent).toContain("limitReached:10");
    expect(button("add")?.disabled).toBe(true);
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

  it("generates a password that meets the rule", async () => {
    await render([]);
    await click(button("add"));

    await click(button("generate"));

    expect(byLabel("password")?.value).toMatch(PASSWORD_RE);
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
    expect(errorFor("password")).toBe("errorPasswordRule");
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

describe("StaffCard: removing a login", () => {
  const openRemove = async () => {
    await render();
    await click(container.querySelector('[aria-label="removeAria:Noi"]'));
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
