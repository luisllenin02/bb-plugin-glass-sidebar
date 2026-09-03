import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import type { CSSProperties } from "react";
import { ACCENT_PALETTE } from "./accent";

type DiscStyle = CSSProperties & { "--disc-color": string };

/**
 * A per-thread dot. Colour comes from the thread's id so the same thread keeps
 * the same colour everywhere it appears. Every colour comes from the shared
 * accent palette, so it follows the plugin's contracted theme vocabulary.
 *
 * `thread` is null for the "and more" disc in a cluster.
 */
export function Disc({ thread }: { thread: PluginSidebarThread | null }) {
  const color =
    thread === null
      ? "var(--muted-foreground)"
      : ACCENT_PALETTE[1 + (hashHue(thread.id) % (ACCENT_PALETTE.length - 1))]!;
  return (
    <span
      className="inline-block size-3.5 shrink-0 rounded-full border border-background bg-[var(--disc-color)]"
      style={{ "--disc-color": color } as DiscStyle}
    />
  );
}

export function hashHue(id: string): number {
  let hash = 0;
  for (let index = 0; index < id.length; index += 1) {
    hash = (hash * 31 + id.charCodeAt(index)) % 360;
  }
  return hash;
}
