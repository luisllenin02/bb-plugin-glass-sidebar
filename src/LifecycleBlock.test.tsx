// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { LifecycleBlock } from "./LifecycleBlock";
import { DEFAULT_SIDEBAR_SETTINGS, type SettingsAccess } from "./row-props";

afterEach(cleanup);

describe("LifecycleBlock", () => {
  it("renders read-only on the defaults when no save callback is supplied", () => {
    render(<LifecycleBlock />);
    const presets = screen.getByLabelText<HTMLInputElement>("Snooze presets");
    expect(presets.value).toBe(DEFAULT_SIDEBAR_SETTINGS.snoozePresets);
    expect(presets.disabled).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Settle inactive threads")
        .disabled,
    ).toBe(true);
  });

  it("reports every field through the same parsers the sidebar uses", () => {
    const onSettingsChange = vi.fn();
    const settings: SettingsAccess = {
      ...DEFAULT_SIDEBAR_SETTINGS,
      snoozePresets: "15m, Focus block=2h",
    };
    render(
      <LifecycleBlock
        settings={settings}
        onSettingsChange={onSettingsChange}
      />,
    );
    expect(screen.getByText(/In use: 15 minutes, Focus block/)).toBeDefined();
  });

  it("says an invalid threshold turns the rule off rather than hiding threads", () => {
    render(
      <LifecycleBlock
        settings={{ ...DEFAULT_SIDEBAR_SETTINGS, inactiveAfterHours: 0 }}
        onSettingsChange={() => {}}
      />,
    );
    expect(
      screen.getByText("Off: every thread stays on Active."),
    ).toBeDefined();
  });

  it("edits each lifecycle field through one settings callback", () => {
    const onSettingsChange = vi.fn();
    render(
      <LifecycleBlock
        settings={DEFAULT_SIDEBAR_SETTINGS}
        onSettingsChange={onSettingsChange}
      />,
    );

    fireEvent.change(screen.getByLabelText("Snooze presets"), {
      target: { value: "10m, 4h" },
    });
    fireEvent.click(screen.getByLabelText("Inactive shelf"));
    fireEvent.change(screen.getByLabelText("Inactive after hours"), {
      target: { value: "12" },
    });
    fireEvent.click(screen.getByLabelText("Settle inactive threads"));
    fireEvent.change(screen.getByLabelText("Settle after days"), {
      target: { value: "7" },
    });
    fireEvent.click(
      screen.getByLabelText("Settle when the pull request merges"),
    );

    expect(onSettingsChange.mock.calls.map(([values]) => values)).toEqual([
      { ...DEFAULT_SIDEBAR_SETTINGS, snoozePresets: "10m, 4h" },
      { ...DEFAULT_SIDEBAR_SETTINGS, inactiveThreadsEnabled: false },
      { ...DEFAULT_SIDEBAR_SETTINGS, inactiveAfterHours: 12 },
      { ...DEFAULT_SIDEBAR_SETTINGS, autoSettleInactive: false },
      { ...DEFAULT_SIDEBAR_SETTINGS, autoSettleAfterDays: 7 },
      { ...DEFAULT_SIDEBAR_SETTINGS, autoSettleOnMerge: false },
    ]);
  });

  it("disables the thresholds their own switch turns off", () => {
    render(
      <LifecycleBlock
        settings={{
          ...DEFAULT_SIDEBAR_SETTINGS,
          inactiveThreadsEnabled: false,
          autoSettleInactive: false,
        }}
        onSettingsChange={() => {}}
      />,
    );
    expect(
      screen.getByLabelText<HTMLInputElement>("Inactive after hours").disabled,
    ).toBe(true);
    expect(
      screen.getByLabelText<HTMLInputElement>("Settle after days").disabled,
    ).toBe(true);
    expect(
      screen.getByText("Off: nothing settles on inactivity alone."),
    ).toBeDefined();
  });
});
