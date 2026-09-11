// @vitest-environment jsdom
//
// A closed snooze picker must mount no items: Radix Select otherwise renders
// every `SelectItem` into a detached fragment on every row. The counter is
// the measurement; opening (mouse or keyboard) must still show the presets.
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, beforeEach, expect, it, vi } from "vitest";

const counter = vi.hoisted(() => ({ itemRenders: 0 }));
vi.mock("./components/Select", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./components/Select")>();
  const Original = actual.SelectItem;
  return {
    ...actual,
    SelectItem: (props: React.ComponentProps<typeof Original>) => {
      counter.itemRenders += 1;
      return <Original {...props} />;
    },
  };
});

const { SnoozeSelect } = await import("./SnoozeSelect");

const presets = [
  { id: "30m", label: "30 minutes", durationMs: 30 * 60_000 },
  { id: "2h", label: "2 hours", durationMs: 2 * 3_600_000 },
  { id: "1d", label: "Tomorrow", durationMs: 24 * 3_600_000 },
];

beforeAll(() => {
  for (const name of [
    "hasPointerCapture",
    "setPointerCapture",
    "releasePointerCapture",
    "scrollIntoView",
  ]) {
    Object.defineProperty(HTMLElement.prototype, name, {
      configurable: true,
      value: vi.fn(),
    });
  }
});

beforeEach(() => {
  counter.itemRenders = 0;
});

afterEach(() => {
  cleanup();
});

function renderPicker(onSnooze = vi.fn(), onOpenChange = vi.fn()) {
  render(
    <SnoozeSelect
      label="Snooze thread"
      snoozePresets={presets}
      triggerClassName="h-5 w-5"
      onOpenChange={onOpenChange}
      onSnooze={onSnooze}
    />,
  );
  return { onSnooze, onOpenChange };
}

it("mounts no preset item while closed", () => {
  renderPicker();
  expect(screen.getByRole("combobox", { name: "Snooze thread" })).toBeTruthy();
  expect(counter.itemRenders).toBe(0);
  expect(screen.queryAllByRole("option")).toHaveLength(0);
});

it("shows every preset on keyboard open and snoozes on pick", async () => {
  const { onSnooze, onOpenChange } = renderPicker();
  fireEvent.keyDown(screen.getByRole("combobox", { name: "Snooze thread" }), {
    key: "Enter",
  });
  const options = await screen.findAllByRole("option");
  expect(options.map((node) => node.textContent)).toEqual([
    "30 minutes",
    "2 hours",
    "Tomorrow",
  ]);
  expect(counter.itemRenders).toBeGreaterThanOrEqual(presets.length);
  expect(onOpenChange).toHaveBeenCalledWith(true);

  const before = Date.now();
  fireEvent.click(screen.getByRole("option", { name: "2 hours" }));
  expect(onSnooze).toHaveBeenCalledOnce();
  expect(onSnooze.mock.calls[0]![0]).toBeGreaterThanOrEqual(
    before + presets[1]!.durationMs,
  );
  expect(onOpenChange).toHaveBeenLastCalledWith(false);
});

it("shows the presets on mouse open too", async () => {
  renderPicker();
  fireEvent.pointerDown(
    screen.getByRole("combobox", { name: "Snooze thread" }),
    { button: 0, pointerType: "mouse" },
  );
  expect(await screen.findAllByRole("option")).toHaveLength(presets.length);
});
