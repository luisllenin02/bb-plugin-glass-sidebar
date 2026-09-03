import {
  definePluginApp,
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreadSplit as useSidebarThreadSplit,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./src/components/Icon";
import { resolvePaneState } from "./src/pane-state";

const WORKING_INDICATORS = new Set<PluginSidebarThread["indicator"]>([
  "runtime",
  "workflow",
  "background-agent",
  "background-command",
  "plan-mode",
  "working-draft",
]);

function ThreadRow({
  thread,
  isActive,
  onNavigate,
}: {
  thread: PluginSidebarThread;
  isActive: boolean;
  onNavigate: () => void;
}) {
  const actions = useSidebarThreadActions();
  const { splitProps, layout } = useSidebarThreadSplit(thread.id);
  const paneState = resolvePaneState(isActive, layout);
  const needsAttention =
    thread.indicator === "waiting-for-input" ||
    thread.indicator === "unread-error";

  return (
    <li>
      <a
        {...splitProps}
        href={`/threads/${thread.id}`}
        data-sidebar-thread-shortcut-target=""
        data-sidebar-thread-id={thread.id}
        data-thread-pane-state={paneState}
        aria-label={thread.indicatorLabel ?? undefined}
        onClick={(event) => {
          event.preventDefault();
          actions.open(thread.id, { split: event.metaKey || event.ctrlKey });
          onNavigate();
        }}
        className="flex items-center gap-2 rounded-md px-2 py-1 text-sm hover:bg-sidebar-accent/60"
      >
        <span className="min-w-0 flex-1 truncate">
          {thread.title ?? thread.titleFallback ?? "Untitled"}
        </span>
        {needsAttention ? (
          <Icon name="question" className="size-3.5 text-attention" />
        ) : WORKING_INDICATORS.has(thread.indicator) ? (
          <Icon name="loading" className="size-3.5 animate-spin" />
        ) : null}
      </a>
    </li>
  );
}

function ProjectThreads({
  project,
  threads,
  activeThreadId,
  onNavigate,
}: {
  project: PluginSidebarProject | null;
  threads: readonly PluginSidebarThread[];
  activeThreadId: string | null;
  onNavigate: () => void;
}) {
  if (threads.length === 0) return null;
  return (
    <section aria-label={project?.name ?? "Other threads"}>
      <h2 className="px-2 pb-1 pt-2 text-xs font-medium text-muted-foreground">
        {project?.name ?? "Other"}
      </h2>
      <ul className="flex flex-col gap-px">
        {threads.map((thread) => (
          <ThreadRow
            key={thread.id}
            thread={thread}
            isActive={thread.id === activeThreadId}
            onNavigate={onNavigate}
          />
        ))}
      </ul>
    </section>
  );
}

function GlassSidebarList({
  activeThreadId,
  onNavigate,
}: PluginThreadListProps) {
  const { status, threads, projects } = useSidebarThreads();
  const knownProjectIds = new Set(projects.map((project) => project.id));
  const orphanThreads = threads.filter(
    (thread) => !knownProjectIds.has(thread.projectId),
  );

  return (
    <div data-glass-sidebar-root className="flex flex-col gap-1 p-2">
      {status === "loading" ? (
        <p role="status" className="px-2 py-3 text-sm text-muted-foreground">
          Loading threads…
        </p>
      ) : status === "error" ? (
        <p role="alert" className="px-2 py-3 text-sm text-destructive">
          Threads could not be loaded.
        </p>
      ) : (
        <>
          {projects.map((project) => (
            <ProjectThreads
              key={project.id}
              project={project}
              threads={threads.filter(
                (thread) => thread.projectId === project.id,
              )}
              activeThreadId={activeThreadId}
              onNavigate={onNavigate}
            />
          ))}
          <ProjectThreads
            project={null}
            threads={orphanThreads}
            activeThreadId={activeThreadId}
            onNavigate={onNavigate}
          />
        </>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_threadList({
    id: "glass-sidebar",
    title: "Glass Sidebar",
    description: "Focused panes, folders, live work, and project identity.",
    component: GlassSidebarList,
  });
});
