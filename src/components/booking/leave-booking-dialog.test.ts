// @vitest-environment happy-dom
import { act, createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { LeaveBookingDialog } from "@/components/booking/leave-booking-dialog";

vi.mock("next-intl", () => ({ useTranslations: () => (key: string) => key }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root;

beforeEach(() => {
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
  document.body.innerHTML = "";
});

const buttons = () => [...document.body.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].map((b) => b.textContent);
const button = (text: string) => [...document.body.querySelectorAll<HTMLButtonElement>("button")].find((b) => b.textContent === text)!;

describe("LeaveBookingDialog", () => {
  it("on the page: stay is the main action, then leave", () => {
    act(() => root.render(createElement(LeaveBookingDialog, { open: true, onContinue: () => {}, onLeave: () => {} })));
    expect(buttons()).toEqual(["leaveStay", "leaveConfirm"]);
  });

  it("inside the checkout: going one step back comes first, and is what it runs", () => {
    const onStepBack = vi.fn();
    const onContinue = vi.fn();
    act(() =>
      root.render(
        createElement(LeaveBookingDialog, { open: true, onContinue, onLeave: () => {}, onStepBack, stepBackLabel: "Back to guest details" }),
      ),
    );
    expect(buttons()).toEqual(["Back to guest details", "leaveStay", "leaveConfirm"]);
    act(() => button("Back to guest details").click());
    expect(onStepBack).toHaveBeenCalledTimes(1);
    expect(onContinue).not.toHaveBeenCalled();
  });

  // Regression (f12e21e): on the payment step the green button released the hold.
  it("when the step back would release the hold: staying is the main action, and the step back says so", () => {
    act(() =>
      root.render(
        createElement(LeaveBookingDialog, { open: true, onContinue: () => {}, onLeave: () => {}, onStepBack: () => {}, stepBackLabel: "Back to the review", stepBackReleasesHold: true }),
      ),
    );
    expect(buttons()).toEqual(["leaveStay", "Back to the review", "leaveConfirm"]);
    expect(document.body.textContent).toContain("leaveStepBackReleasesHold");
  });
});
