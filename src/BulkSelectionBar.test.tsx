// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, expect, it, vi } from "vitest";
import { BulkSelectionBar } from "./BulkSelectionBar";

beforeAll(() => {
  Object.defineProperty(HTMLElement.prototype, "hasPointerCapture", {
    configurable: true,
    value: () => false,
  });
  Object.defineProperty(HTMLElement.prototype, "setPointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, "releasePointerCapture", {
    configurable: true,
    value: () => undefined,
  });
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
    configurable: true,
    value: () => undefined,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});

it("uses the configured snooze presets to calculate the requested wake time", async () => {
  const now = 2_000_000_000_000;
  vi.spyOn(Date, "now").mockReturnValue(now);
  const onSnooze = vi.fn();

  render(
    <BulkSelectionBar
      count={2}
      busy={false}
      snoozePresets={[
        { id: "focus", label: "Focus block", durationMs: 45 * 60_000 },
        { id: "tomorrow", label: "Tomorrow", durationMs: 24 * 60 * 60_000 },
      ]}
      onSettle={() => undefined}
      onSnooze={onSnooze}
      onMarkRead={() => undefined}
      onMarkUnread={() => undefined}
      onClear={() => undefined}
    />,
  );

  fireEvent.pointerDown(
    screen.getByRole("combobox", { name: "Snooze selected threads" }),
    { button: 0, pointerType: "mouse" },
  );
  fireEvent.click(await screen.findByRole("option", { name: "Focus block" }));

  expect(onSnooze).toHaveBeenCalledOnce();
  expect(onSnooze).toHaveBeenCalledWith(now + 45 * 60_000);
});
