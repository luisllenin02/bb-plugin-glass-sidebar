import { useLayoutEffect, useState, type RefObject } from "react";

/** Mirrors bb's narrow-split header breakpoint. */
export const NARROW_THREAD_HEADER_PANE_WIDTH = 560;

/**
 * `isCompactViewport` only describes the whole browser. A split pane can be
 * much narrower, so each header control also observes its own pane and drops
 * optional label text before the host has to clip an action.
 */
export function useCompactThreadHeaderControl<T extends HTMLElement>(
  rootRef: RefObject<T | null>,
  isCompactViewport: boolean,
): boolean {
  const [isNarrowPane, setIsNarrowPane] = useState(false);

  useLayoutEffect(() => {
    const root = rootRef.current;
    const pane = root?.closest<HTMLElement>("[data-split-pane-id]");
    if (!pane || typeof ResizeObserver === "undefined") {
      setIsNarrowPane(false);
      return;
    }

    const update = (width: number) => {
      const next = width < NARROW_THREAD_HEADER_PANE_WIDTH;
      setIsNarrowPane((current) => (current === next ? current : next));
    };

    update(pane.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      update(entries[0]?.contentRect.width ?? pane.getBoundingClientRect().width);
    });
    observer.observe(pane);
    return () => observer.disconnect();
  }, [rootRef]);

  return isCompactViewport || isNarrowPane;
}
