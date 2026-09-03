// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  DRAG_THRESHOLD_PX,
  TOUCH_HOLD_MS,
  TOUCH_HOLD_SLOP_PX,
  armTouchHold,
  blockTouchScroll,
  pointerKind,
  unengagedMove,
} from "./drag-gesture";

afterEach(() => {
  vi.useRealTimers();
});

describe("pointerKind", () => {
  it("treats fingers and pens as touch and everything else as a mouse", () => {
    expect(pointerKind("touch")).toBe("touch");
    expect(pointerKind("pen")).toBe("touch");
    expect(pointerKind("mouse")).toBe("mouse");
    expect(pointerKind(undefined)).toBe("mouse");
  });
});

describe("unengagedMove", () => {
  it("engages a mouse after a short travel", () => {
    expect(unengagedMove("mouse", DRAG_THRESHOLD_PX - 1, false)).toBe("wait");
    expect(unengagedMove("mouse", DRAG_THRESHOLD_PX, false)).toBe("engage");
  });

  it("hands a scrolling finger back to the browser before the hold", () => {
    expect(unengagedMove("touch", TOUCH_HOLD_SLOP_PX, false)).toBe("wait");
    expect(unengagedMove("touch", TOUCH_HOLD_SLOP_PX + 1, false)).toBe("abort");
    expect(unengagedMove("touch", 200, false)).toBe("abort");
  });

  it("engages a finger only once it has held still", () => {
    expect(unengagedMove("touch", 1, true)).toBe("engage");
    expect(unengagedMove("touch", 80, true)).toBe("engage");
  });
});

describe("armTouchHold", () => {
  it("fires after the hold delay unless disarmed first", () => {
    vi.useFakeTimers();
    const onHold = vi.fn();
    const disarm = armTouchHold(onHold);
    vi.advanceTimersByTime(TOUCH_HOLD_MS - 1);
    expect(onHold).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(onHold).toHaveBeenCalledTimes(1);
    disarm();

    const cancelled = vi.fn();
    const disarmEarly = armTouchHold(cancelled);
    vi.advanceTimersByTime(TOUCH_HOLD_MS / 2);
    disarmEarly();
    vi.advanceTimersByTime(TOUCH_HOLD_MS);
    expect(cancelled).not.toHaveBeenCalled();
  });
});

describe("blockTouchScroll", () => {
  it("cancels touchmove while attached and stops once released", () => {
    const release = blockTouchScroll(window);
    const blocked = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(blocked);
    expect(blocked.defaultPrevented).toBe(true);

    release();
    const free = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(free);
    expect(free.defaultPrevented).toBe(false);
  });
});
