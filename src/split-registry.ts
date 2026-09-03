/**
 * External store of "which pane is this thread in", fed by one `<SplitProbe>`
 * per candidate thread because `experimental_useSidebarThreadSplit` is a
 * per-thread hook and cannot be called in a loop (see brief §4.5).
 *
 * `OpenPanesRow` subscribes with `useSyncExternalStore`; the snapshot array is
 * only replaced when the set of reporting threads actually changes, so a
 * dedupe check in `reportPane` matters for render stability.
 */
export interface SplitPaneEntry {
  threadId: string;
  ordinal: number;
  count: number;
  isFocused: boolean;
}

type Listener = () => void;

const panes = new Map<string, SplitPaneEntry>();
const listeners = new Set<Listener>();
let snapshot: readonly SplitPaneEntry[] = [];

function computeSnapshot(): readonly SplitPaneEntry[] {
  return [...panes.values()].sort((a, b) => a.ordinal - b.ordinal);
}

function isSameEntry(
  a: SplitPaneEntry,
  b: Omit<SplitPaneEntry, "threadId">,
): boolean {
  return (
    a.ordinal === b.ordinal &&
    a.count === b.count &&
    a.isFocused === b.isFocused
  );
}

/** Report (or clear, with `null`) one thread's place in the split layout. */
export function reportPane(
  threadId: string,
  entry: Omit<SplitPaneEntry, "threadId"> | null,
): void {
  if (entry === null) {
    if (!panes.has(threadId)) return;
    panes.delete(threadId);
  } else {
    const current = panes.get(threadId);
    if (current && isSameEntry(current, entry)) return;
    panes.set(threadId, { threadId, ...entry });
  }
  snapshot = computeSnapshot();
  for (const listener of listeners) listener();
}

export function subscribe(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getSnapshot(): readonly SplitPaneEntry[] {
  return snapshot;
}

/** Test-only: drop every reported pane so specs start from a clean store. */
export function resetSplitRegistryForTests(): void {
  panes.clear();
  snapshot = [];
}
