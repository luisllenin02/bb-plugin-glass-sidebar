/**
 * Pointer-type-aware gating for the sidebar's in-list drags (folder moves,
 * pinned and inbox reorder). A mouse engages after a short travel. A finger
 * is scrolling until proven otherwise: it must hold still first, and any
 * scroll-sized movement before the hold completes hands the gesture back to
 * the browser. Once a touch drag is engaged, native scrolling is blocked for
 * the rest of that gesture so the list does not move under the row.
 */

export const DRAG_THRESHOLD_PX = 5;
export const TOUCH_HOLD_MS = 350;
export const TOUCH_HOLD_SLOP_PX = 10;

export type PointerKind = "mouse" | "touch";

export function pointerKind(pointerType: string | undefined | null): PointerKind {
  return pointerType === "touch" || pointerType === "pen" ? "touch" : "mouse";
}

export type UnengagedMoveOutcome = "wait" | "engage" | "abort";

/**
 * What an unengaged gesture should do with a pointer move of `distance` px
 * from its origin. `held` is true once the touch hold timer has fired.
 */
export function unengagedMove(
  kind: PointerKind,
  distance: number,
  held: boolean,
): UnengagedMoveOutcome {
  if (kind === "mouse") {
    return distance >= DRAG_THRESHOLD_PX ? "engage" : "wait";
  }
  if (held) return "engage";
  return distance > TOUCH_HOLD_SLOP_PX ? "abort" : "wait";
}

type Scheduler = {
  setTimeout: (callback: () => void, ms: number) => number;
  clearTimeout: (handle: number) => void;
};

/** Start the touch hold timer; returns a disposer that disarms it. */
export function armTouchHold(
  onHold: () => void,
  scheduler: Scheduler = {
    setTimeout: (callback, ms) => window.setTimeout(callback, ms),
    clearTimeout: (handle) => window.clearTimeout(handle),
  },
): () => void {
  let handle: number | null = scheduler.setTimeout(() => {
    handle = null;
    onHold();
  }, TOUCH_HOLD_MS);
  return () => {
    if (handle !== null) scheduler.clearTimeout(handle);
    handle = null;
  };
}

/**
 * Keep the browser from scrolling for the rest of the current touch gesture.
 * Must be attached before the finger moves; `pointermove.preventDefault()`
 * alone does not stop touch scrolling. Returns a disposer.
 */
export function blockTouchScroll(target: EventTarget = window): () => void {
  const listener = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  target.addEventListener("touchmove", listener, { passive: false });
  return () => target.removeEventListener("touchmove", listener);
}
