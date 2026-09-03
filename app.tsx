// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadList } from "./src/ThreadList";
import { ParentChip } from "./src/ParentChip";
import { SubagentsChip } from "./src/SubagentsChip";

const parentAction = {
  id: "parent",
  title: "Parent thread",
  component: ParentChip,
} as const;

const childrenAction = {
  id: "children",
  title: "Child threads",
  component: SubagentsChip,
} as const;

export const HEADER_ACTIONS = [
  parentAction,
  childrenAction,
  /* @header-actions (Q4) */
] as const;

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "inbox",
    title: "Glass Sidebar",
    description: "Focused panes, folders, live work, and project identity.",
    component: ThreadList,
  });

  for (const action of HEADER_ACTIONS) {
    app.slots.experimental_threadHeaderAction(action);
  }

  /* @settings-section (Q6) */
});
