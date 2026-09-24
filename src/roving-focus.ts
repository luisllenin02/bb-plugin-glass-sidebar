import {
  createContext,
  useCallback,
  useContext,
  useSyncExternalStore,
  type KeyboardEvent as ReactKeyboardEvent,
} from "react";

/**
 * One tab stop for the whole thread list (roving tabindex).
 *
 * Every row's anchor and its inline controls used to be separate tab stops:
 * about 300 of them, so Tab never reached the composer. Now exactly one row —
 * the one last focused, else the thread you are on, else the first — takes
 * part in the tab order, with its own controls; Up/Down, Home/End move
 * between rows, and the context-menu key or Shift+F10 opens the row menu.
 *
 * The store lives outside React state so moving focus re-renders two rows,
 * not the list: each row subscribes to "am I the stop?" and nothing else.
 * The list syncs it while it renders, before its rows do, so a row that is
 * re-rendering anyway (navigation changes `isActive`) reads the new stop in
 * the same pass; `flush` then wakes only the memoised rows that were skipped.
 */
export interface RovingStore {
  isStop: (rowId: string) => boolean;
  /** A row took focus; it keeps the stop while it stays on screen. */
  prefer: (rowId: string) => void;
  /** Called by the list while it renders: what is on screen, and the row
   * that holds the stop when the preferred one is gone. Never notifies. */
  sync: (rowIds: ReadonlySet<string>, fallbackId: string | null) => void;
  /** Called from a layout effect: notifies if `sync` moved the stop. */
  flush: () => void;
  subscribe: (listener: () => void) => () => void;
}

export function createRovingStore(): RovingStore {
  let preferred: string | null = null;
  let fallback: string | null = null;
  let onScreen: ReadonlySet<string> = new Set();
  let stop: string | null = null;
  let pending = false;
  const listeners = new Set<() => void>();
  const update = () => {
    const next =
      preferred !== null && onScreen.has(preferred) ? preferred : fallback;
    if (next === stop) return;
    stop = next;
    pending = true;
  };
  const flush = () => {
    if (!pending) return;
    pending = false;
    for (const listener of listeners) listener();
  };
  return {
    isStop: (rowId) => rowId === stop,
    prefer: (rowId) => {
      preferred = rowId;
      update();
      flush();
    },
    sync: (rowIds, fallbackId) => {
      onScreen = rowIds;
      fallback = fallbackId;
      update();
    },
    flush,
    subscribe: (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

export const RovingFocusContext = createContext<RovingStore | null>(null);

const noSubscription = () => () => {};

/**
 * Whether this row holds the list's tab stop. Outside a list (tests, the
 * search listbox, header popovers) every row stays tabbable as before.
 */
export function useRowTabStop(rowId: string): {
  isTabStop: boolean;
  onFocus: () => void;
} {
  const store = useContext(RovingFocusContext);
  const isTabStop = useSyncExternalStore(
    store ? store.subscribe : noSubscription,
    () => (store ? store.isStop(rowId) : true),
  );
  const onFocus = useCallback(() => store?.prefer(rowId), [store, rowId]);
  return { isTabStop, onFocus };
}

/** Marks a row root; the anchor inside it is where focus lands. */
const ROW_ATTRIBUTE = "data-glass-row";
const ROW_SELECTOR = `[${ROW_ATTRIBUTE}]`;
const ROW_ANCHOR_SELECTOR = "a[data-sidebar-thread-shortcut-target]";

/**
 * Opens a row's context menu from the keyboard or the touch "…" button by
 * sending the same event a right-click does, placed at `from`. Radix restores
 * focus to the opener when the menu closes.
 */
export function openRowMenu(from: HTMLElement, at: "start" | "end" = "end") {
  const rect = from.getBoundingClientRect();
  from.dispatchEvent(
    new MouseEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      clientX: at === "start" ? rect.left + 12 : rect.right,
      clientY: rect.bottom,
    }),
  );
}

/** The list's keyboard handler: row-to-row movement and the menu key. */
export function handleRovingKeyDown(event: ReactKeyboardEvent<HTMLElement>) {
  if (event.defaultPrevented || event.altKey || event.ctrlKey || event.metaKey) {
    return;
  }
  const target = event.target as HTMLElement;
  if (target.closest("input, textarea, select, [contenteditable='true']")) {
    return;
  }
  const row = target.closest<HTMLElement>(ROW_SELECTOR);
  if (!row || !event.currentTarget.contains(row)) return;

  if (event.key === "ContextMenu" || (event.shiftKey && event.key === "F10")) {
    event.preventDefault();
    const anchor = row.querySelector<HTMLElement>(ROW_ANCHOR_SELECTOR);
    openRowMenu(anchor ?? row, "start");
    return;
  }
  if (event.shiftKey) return;
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;

  const rows = [
    ...event.currentTarget.querySelectorAll<HTMLElement>(ROW_SELECTOR),
  ];
  const index = rows.indexOf(row);
  const next =
    event.key === "Home"
      ? rows[0]
      : event.key === "End"
        ? rows[rows.length - 1]
        : rows[index + (event.key === "ArrowDown" ? 1 : -1)];
  event.preventDefault();
  next?.querySelector<HTMLElement>(ROW_ANCHOR_SELECTOR)?.focus();
}
