import { memo, useEffect } from "react";
import { experimental_useSidebarThreadSplit as useSidebarThreadSplit } from "@get-bb/plugin-sdk/app";
import { isFocusedPane, paneOrdinal } from "./pane-state";
import { reportPane } from "./split-registry";

/**
 * Mounted once per candidate thread so the live strip can know, without
 * calling the per-thread split hook in a loop, where every open thread sits
 * in the split layout. Renders nothing; it only feeds `split-registry`.
 *
 * Memoised on its one prop: there is a probe per thread, and a list render
 * must not walk them all again to draw nothing.
 */
export const SplitProbe = memo(function SplitProbe({
  threadId,
}: {
  threadId: string;
}) {
  const { layout } = useSidebarThreadSplit(threadId);

  useEffect(() => {
    if (layout === null) {
      reportPane(threadId, null);
      return;
    }
    const ordinal = paneOrdinal(layout.panes);
    reportPane(
      threadId,
      ordinal === null
        ? null
        : {
            ordinal: ordinal.index,
            count: ordinal.count,
            isFocused: isFocusedPane(layout.panes),
          },
    );
  }, [threadId, layout]);

  useEffect(() => {
    return () => reportPane(threadId, null);
  }, [threadId]);

  return null;
});
