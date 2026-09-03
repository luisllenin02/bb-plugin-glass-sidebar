// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import { definePluginApp } from "@get-bb/plugin-sdk/app";
import { ThreadList } from "./src/ThreadList";
import { ParentChip } from "./src/ParentChip";
import { SubagentsChip } from "./src/SubagentsChip";
import { ProjectChip } from "./src/ProjectChip";
import { SidebarSettings } from "./src/SidebarSettings";

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

const projectAction = {
  id: "project",
  title: "Project",
  component: ProjectChip,
} as const;

export const HEADER_ACTIONS = [
  parentAction,
  childrenAction,
  /* @header-actions (Q4) */
  projectAction,
] as const;

const RESPONSIVE_CHILD_HEADER_STYLE = `
[data-bb-plugin="glass-sidebar"] span[role="group"][aria-label="Child threads"] {
  min-width: 0 !important;
  max-width: 100% !important;
  flex-shrink: 1 !important;
}
[data-bb-plugin="glass-sidebar"] span[role="group"][aria-label="Child threads"] > * {
  min-width: 0 !important;
  max-width: 100% !important;
}
[data-bb-plugin="glass-sidebar"] button[data-glass-sidebar-child-action] {
  min-width: 0 !important;
  max-width: 100% !important;
  width: 100%;
}
[data-bb-plugin="glass-sidebar"] button[data-glass-sidebar-child-action] > span.truncate {
  min-width: 0;
}
`;

export default definePluginApp((app) => {
  app.contentScripts.register({
    id: "responsive-child-header-action",
    mount() {
      const style = document.createElement("style");
      style.dataset.bbPlugin = "glass-sidebar-responsive-child-header";
      style.textContent = RESPONSIVE_CHILD_HEADER_STYLE;
      document.head.append(style);
      return () => style.remove();
    },
  });

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
  app.slots.settingsSection({
    id: "glass-sidebar-settings",
    component: SidebarSettings,
  });
});
