import { describe, expect, it } from "vitest";
import { POST } from "./route";
import { makeRequest, readJson } from "../../../../test/helpers/request";

const post = (payload: unknown) => POST(makeRequest("/api/locale", { body: payload }));

describe("POST /api/locale", () => {
  it.each(["en", "th"])("remembers the %s locale in a year-long cookie", async (locale) => {
    const response = await post({ locale });

    await expect(readJson(response)).resolves.toEqual({ status: 200, body: { locale } });

    const cookie = response.cookies.get("locale");
    expect(cookie).toMatchObject({ value: locale, path: "/", maxAge: 60 * 60 * 24 * 365, sameSite: "lax" });
  });

  it.each([["de"], [""], [null], [123]])("refuses the unsupported locale %s", async (locale) => {
    const response = await post({ locale });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ error: "Invalid locale" });
    expect(response.cookies.get("locale")).toBeUndefined();
  });

  it("refuses a body with no locale at all", async () => {
    expect((await post({})).status).toBe(400);
  });
});
