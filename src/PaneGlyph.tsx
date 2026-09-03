import type { PluginSidebarSplitPane } from "@get-bb/plugin-sdk/app";
import { cn } from "./lib/utils";
import { isFocusedPane, orderedPanes, paneOrdinal } from "./pane-state";

// Geometry copied from bb's own sidebar mini-map
// (apps/app/src/components/sidebar/SplitPaneMiniMap.tsx) so a plugin row and a
// host row draw the same picture of the same layout.
const GLYPH_SIZE = 14;
const GLYPH_PADDING = 1;
const INNER = GLYPH_SIZE - 2 * GLYPH_PADDING;
const OUTLINE_WIDTH = 1;

function offset(value: number): number {
  return GLYPH_PADDING + value * INNER;
}

function extent(value: number): number {
  return value * INNER;
}

/** A stroked rect is centred on its edge, so it needs half a stroke of inset. */
function outlineInset(isMe: boolean): number {
  return isMe ? 0 : OUTLINE_WIDTH / 2;
}

/**
 * Where this thread sits in the split: a 14 px map of the panes with this
 * thread's pane filled, plus "Pane N of M" in words. The map alone answers
 * "where", the chip answers it for anyone not reading a 14 px picture.
 */
export function PaneGlyph({
  panes,
  className,
}: {
  panes: readonly PluginSidebarSplitPane[];
  className?: string;
}) {
  const ordinal = paneOrdinal(panes);
  if (ordinal === null) return null;
  const focused = isFocusedPane(panes);
  const label = `Open in pane ${ordinal.index} of ${ordinal.count}, ${
    focused ? "focused" : "not focused"
  }`;

  return (
    <span
      className={cn(
        "pointer-events-none flex shrink-0 items-center gap-1",
        className,
      )}
    >
      <svg
        width={GLYPH_SIZE}
        height={GLYPH_SIZE}
        viewBox={`0 0 ${GLYPH_SIZE} ${GLYPH_SIZE}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
        className={cn("size-3.5 shrink-0", !focused && "opacity-60")}
      >
        {orderedPanes(panes).map((pane) => {
          const inset = outlineInset(pane.isMe);
          return (
            <rect
              key={pane.paneId}
              data-pane-id={pane.paneId}
              x={offset(pane.rect.x) + inset}
              y={offset(pane.rect.y) + inset}
              width={Math.max(extent(pane.rect.width) - 2 * inset, 0)}
              height={Math.max(extent(pane.rect.height) - 2 * inset, 0)}
              strokeWidth={pane.isMe ? 0 : OUTLINE_WIDTH}
              className={
                pane.isMe
                  ? pane.isFocused
                    ? "fill-primary/70 stroke-none"
                    : "fill-muted-foreground/45 stroke-none"
                  : "fill-none stroke-muted-foreground/30"
              }
            />
          );
        })}
      </svg>
      <span className="shrink-0 text-2xs text-muted-foreground">
        Pane {ordinal.index} of {ordinal.count}
      </span>
    </span>
  );
}
