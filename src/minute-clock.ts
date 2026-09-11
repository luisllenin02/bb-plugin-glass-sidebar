import { useSyncExternalStore } from "react";

/**
 * One module-level minute clock, shared by every age label in the sidebar.
 *
 * A row's age is the only thing that actually changes on a minute boundary,
 * so the label — not the list — owns the subscription. Reading it through
 * `useSyncExternalStore` lets a memoised card or slim row skip the tick
 * entirely while the tiny age span inside it re-renders alone.
 *
 * A single interval serves every subscriber and is torn down when the last
 * one unsubscribes (e.g. the sidebar unmounts). The value is quantized to the
 * minute, so all subscribers in one tick agree on "now".
 */
const MINUTE_MS = 60_000;
/**
 * The Active/Inactive boundary only needs to move on a coarse cadence. A
 * 5-minute quantum keeps a long-open tab from stalling a thread's promotion
 * into Inactive while re-rendering the list a fraction as often as the age
 * labels do.
 */
const PARTITION_QUANTUM_MINUTES = 5;

let currentMinute = Math.floor(Date.now() / MINUTE_MS);
const listeners = new Set<() => void>();
let timer: ReturnType<typeof setInterval> | null = null;

function minuteSnapshot(): number {
  return currentMinute;
}

function partitionSnapshot(): number {
  return currentMinute - (currentMinute % PARTITION_QUANTUM_MINUTES);
}

function tick(): void {
  const next = Math.floor(Date.now() / MINUTE_MS);
  if (next === currentMinute) return;
  currentMinute = next;
  for (const listener of listeners) listener();
}

function subscribe(listener: () => void): () => void {
  // Refresh before the first snapshot read so a long-idle mount — the tab was
  // backgrounded and every row unmounted, clearing the interval — never
  // paints a stale age.
  currentMinute = Math.floor(Date.now() / MINUTE_MS);
  listeners.add(listener);
  if (timer === null) timer = setInterval(tick, MINUTE_MS);
  return () => {
    listeners.delete(listener);
    if (listeners.size === 0 && timer !== null) {
      clearInterval(timer);
      timer = null;
    }
  };
}

/** The current minute, advancing once per minute while any row subscribes. */
export function useMinuteClock(): number {
  return useSyncExternalStore(subscribe, minuteSnapshot, minuteSnapshot);
}

/** `useMinuteClock()` as a millisecond timestamp, for age arithmetic. */
export function useMinuteNow(): number {
  return useMinuteClock() * MINUTE_MS;
}

/**
 * A coarse clock for the Active/Inactive partition. Its snapshot changes at
 * most once per quantum, so the list that subscribes to it re-renders on that
 * cadence rather than every minute.
 */
export function useInactiveBoundaryNow(): number {
  return (
    useSyncExternalStore(subscribe, partitionSnapshot, partitionSnapshot) *
    MINUTE_MS
  );
}
