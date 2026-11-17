// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { useTranslations } from "next-intl";
import { afterEach, beforeEach, expect, it } from "vitest";
import { withIntl } from "../../../../test/helpers/intl";
import AdminLoginLayout from "./layout";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

function OtpCopy() {
  const t = useTranslations("auth");
  const tc = useTranslations("common");
  return createElement("p", null, `${t("otpTitle")} / ${tc("close")}`);
}

it("gives the OTP modal English copy even when the site locale is Thai", async () => {
  await act(async () =>
    root.render(withIntl(createElement(AdminLoginLayout, null, createElement(OtpCopy)), "th")),
  );
  expect(container.textContent).toBe("Enter Verification Code / Close");
});
