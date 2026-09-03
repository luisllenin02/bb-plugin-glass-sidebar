import {
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type ReactNode,
} from "react";
import type {
  PluginSidebarThread,
  PluginSidebarThreadActions,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk/app";
import { ACCENT_PALETTE } from "./accent";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { threadDisplayTitle } from "./inbox";
import { relativeTimeLabel } from "./relative-time";
import type { ProjectDecorEntry, ProjectIconColorName } from "./row-props";
import { StatusGlyph } from "./StatusGlyph";
import { ProviderGlyph } from "./ProviderGlyph";
import { ProjectGlyph } from "./ProjectGlyph";
import {
  chipLabel,
  classifyNow,
  nowRows,
} from "./live-strip";
import { buildColumns, type ColumnViewModel } from "./columns-view";
import {
  getSnapshot,
  subscribe,
  type SplitPaneEntry,
} from "./split-registry";
import type { WorkflowRun } from "./workflow-activity-shared";

export const COLLAPSE_STORAGE_PREFIX = "bb-sidebar.liveStrip.";
export const COLUMNS_EXPANDED_STORAGE_KEY =
  "glass-sidebar.liveStrip.openPanes.expanded";

const PROJECT_DECOR_ACCENTS: Record<ProjectIconColorName, string> = {
  red: ACCENT_PALETTE[2],
  orange: ACCENT_PALETTE[8],
  yellow: ACCENT_PALETTE[3],
  green: ACCENT_PALETTE[4],
  teal: ACCENT_PALETTE[7],
  blue: ACCENT_PALETTE[1],
  purple: ACCENT_PALETTE[6],
  pink: ACCENT_PALETTE[5],
};

function readCollapsed(key: string): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(COLLAPSE_STORAGE_PREFIX + key) === "collapsed";
  } catch {
    return false;
  }
}

function writeCollapsed(key: string, collapsed: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      COLLAPSE_STORAGE_PREFIX + key,
      collapsed ? "collapsed" : "expanded",
    );
  } catch {
    // Private-browsing / storage-disabled: the section just stays expanded.
  }
}

function useLiveStripExpanded(key: string): [boolean, () => void] {
  const [collapsed, setCollapsed] = useState(() => readCollapsed(key));
  return [
    !collapsed,
    () => {
      setCollapsed((current) => {
        const next = !current;
        writeCollapsed(key, next);
        return next;
      });
    },
  ];
}

function readColumnsExpanded(): boolean {
  try {
    if (typeof localStorage === "undefined") return false;
    return localStorage.getItem(COLUMNS_EXPANDED_STORAGE_KEY) === "expanded";
  } catch {
    return false;
  }
}

function writeColumnsExpanded(expanded: boolean): void {
  try {
    if (typeof localStorage === "undefined") return;
    localStorage.setItem(
      COLUMNS_EXPANDED_STORAGE_KEY,
      expanded ? "expanded" : "collapsed",
    );
  } catch {
    // Storage-disabled clients keep the in-memory choice for this mount.
  }
}

function LiveStripSection({
  label,
  count,
  expanded,
  onToggle,
  controls,
  children,
}: {
  label: string;
  count: number;
  expanded: boolean;
  onToggle: () => void;
  controls?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section aria-label={label}>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={expanded}
          className="flex min-w-0 flex-1 items-center gap-2 px-2.5 pb-1 pt-2 text-left"
        >
          <span className="text-2xs font-medium text-muted-foreground/70">
            {expanded ? label : `${label} (${count})`}
          </span>
          <span className="h-px flex-1 bg-sidebar-border" />
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 shrink-0 text-muted-foreground/70 transition-transform duration-150 ease-out motion-reduce:transition-none",
              expanded && "rotate-180",
            )}
          />
        </button>
        {controls}
      </div>
      {expanded ? children : null}
    </section>
  );
}

function AccentOrProviderDot({
  thread,
  accent,
}: {
  thread: PluginSidebarThread;
  accent: string | undefined;
}) {
  if (accent) {
    return (
      <span
        aria-hidden="true"
        data-project-colour-dot="true"
        className="size-2 shrink-0 rounded-full"
        style={
          {
            "--thread-accent": accent,
            backgroundColor: "var(--thread-accent)",
          } as CSSProperties
        }
      />
    );
  }
  return <ProviderGlyph providerId={thread.providerId} />;
}

function ProjectDot({ accent }: { accent: string | undefined }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        "size-2 shrink-0 rounded-full",
        !accent && "bg-muted-foreground/50",
      )}
      style={
        accent
          ? ({
              "--thread-accent": accent,
              backgroundColor: "var(--thread-accent)",
            } as CSSProperties)
          : undefined
      }
    />
  );
}

function nowStatusIndicator(
  thread: PluginSidebarThread,
  needsYou: boolean,
): PluginSidebarThreadIndicator {
  if (needsYou) return thread.indicator;
  if (thread.activity.workflows > 0) return "workflow";
  switch (thread.indicator) {
    case "runtime":
    case "workflow":
    case "background-agent":
    case "background-command":
    case "plan-mode":
    case "working-draft":
      return thread.indicator;
  }
  if (thread.activity.backgroundAgents > 0) return "background-agent";
  if (thread.activity.backgroundCommands > 0) return "background-command";
  if (thread.activity.planMode > 0) return "plan-mode";
  if (thread.activity.goals > 0) return "goal";
  return "runtime";
}

export interface LiveStripCommonProps {
  threads: readonly PluginSidebarThread[];
  projectNameById: ReadonlyMap<string, string>;
  accentFor: (thread: PluginSidebarThread) => string | undefined;
  projectDecor?: Readonly<Record<string, ProjectDecorEntry>>;
  activeThreadId: string | null;
  onNavigate: () => void;
  actions: PluginSidebarThreadActions;
  workflowRows?: readonly WorkflowRun[];
}

function liveStripAccent(
  thread: PluginSidebarThread,
  accentFor: LiveStripCommonProps["accentFor"],
  projectDecor: Readonly<Record<string, ProjectDecorEntry>>,
): string | undefined {
  const resolved = accentFor(thread);
  if (resolved) return resolved;
  const decorColour = projectDecor[thread.projectId]?.iconColor;
  return decorColour ? PROJECT_DECOR_ACCENTS[decorColour] : undefined;
}

function chipsFromEntries(
  entries: readonly SplitPaneEntry[],
  threads: readonly PluginSidebarThread[],
): Array<{ entry: SplitPaneEntry; thread: PluginSidebarThread }> {
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  const chips: Array<{ entry: SplitPaneEntry; thread: PluginSidebarThread }> = [];
  for (const entry of entries) {
    const thread = threadById.get(entry.threadId);
    if (thread) chips.push({ entry, thread });
  }
  return chips;
}

export function OpenPanesRow({
  threads,
  accentFor,
  projectDecor = {},
  activeThreadId,
  onNavigate,
  actions,
  workflowRows = [],
  now = Date.now(),
}: LiveStripCommonProps & { now?: number }) {
  const entries = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [expanded, toggle] = useLiveStripExpanded("openPanes");
  const [columnsExpanded, setColumnsExpanded] = useState(readColumnsExpanded);
  const chips = chipsFromEntries(entries, threads);
  if (chips.length < 2) return null;
  const columns = buildColumns(entries, threads, workflowRows, (thread) =>
    liveStripAccent(thread, accentFor, projectDecor),
  );

  return (
    <LiveStripSection
      label="Open panes"
      count={chips.length}
      expanded={expanded}
      onToggle={toggle}
      controls={
        <button
          type="button"
          aria-label="Columns"
          aria-pressed={columnsExpanded}
          onClick={() =>
            setColumnsExpanded((current) => {
              const next = !current;
              writeColumnsExpanded(next);
              return next;
            })
          }
          className="mr-2 mt-1.5 flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-2xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
        >
          <span>Columns</span>
          <Icon
            name="ChevronDown"
            className={cn(
              "size-3 transition-transform duration-150 ease-out motion-reduce:transition-none",
              columnsExpanded && "rotate-180",
            )}
          />
        </button>
      }
    >
      {columnsExpanded ? (
        <ColumnsStrip
          columns={columns}
          threads={threads}
          projectDecor={projectDecor}
          now={now}
          activeThreadId={activeThreadId}
          onNavigate={onNavigate}
          actions={actions}
        />
      ) : (
        <div
          role="group"
          aria-label="Open panes"
          className="flex flex-wrap gap-1 px-2.5 pb-2"
        >
          {chips.map(({ entry, thread }) => {
            const accent = liveStripAccent(thread, accentFor, projectDecor);
            const title = chipLabel(threadDisplayTitle(thread));
            const filled = entry.isFocused || thread.id === activeThreadId;
            return (
              <button
                key={thread.id}
                type="button"
                data-open-pane-thread-id={thread.id}
                data-live-strip="open-panes"
                aria-label={`Open pane: ${title}, pane ${entry.ordinal} of ${entry.count}${
                  filled ? ", focused" : ""
                }`}
                onClick={(event) => {
                  actions.open(
                    thread.id,
                    event.metaKey || event.ctrlKey
                      ? { split: true }
                      : undefined,
                  );
                  onNavigate();
                }}
                className={cn(
                  "flex max-w-36 items-center gap-1.5 rounded-full border px-2 py-1 text-2xs",
                  filled
                    ? "border-transparent bg-primary/15 text-foreground ring-1 ring-primary/60"
                    : "border-sidebar-border text-muted-foreground hover:bg-sidebar-accent/60",
                )}
              >
                <AccentOrProviderDot thread={thread} accent={accent} />
                <span className="truncate">{title}</span>
              </button>
            );
          })}
        </div>
      )}
    </LiveStripSection>
  );
}

function ColumnsStrip({
  columns,
  threads,
  projectDecor,
  now,
  activeThreadId,
  onNavigate,
  actions,
}: {
  columns: readonly ColumnViewModel[];
  threads: readonly PluginSidebarThread[];
  projectDecor: Readonly<Record<string, ProjectDecorEntry>>;
  now: number;
  activeThreadId: string | null;
  onNavigate: () => void;
  actions: PluginSidebarThreadActions;
}) {
  const threadById = new Map(threads.map((thread) => [thread.id, thread]));
  return (
    <div
      role="group"
      aria-label="Session columns"
      className="flex snap-x snap-mandatory gap-2 overflow-x-auto px-2.5 pb-2"
    >
      {columns.map((column) => {
        const thread = threadById.get(column.threadId);
        const focused = column.isFocused || column.threadId === activeThreadId;
        return (
          <button
            key={column.threadId}
            type="button"
            data-column-thread-id={column.threadId}
            aria-label={`Column ${column.ordinal}: ${column.title}${focused ? ", focused" : ""}`}
            onClick={(event) => {
              actions.open(
                column.threadId,
                event.metaKey || event.ctrlKey ? { split: true } : undefined,
              );
              onNavigate();
            }}
            className={cn(
              "flex min-w-40 snap-start flex-col gap-2 rounded-lg border bg-sidebar-accent/25 p-2 text-left text-xs",
              focused
                ? "border-primary/60 ring-2 ring-primary/60"
                : "border-sidebar-border hover:bg-sidebar-accent/60",
            )}
          >
            <span className="flex min-w-0 items-center gap-1.5">
              <ProjectGlyph
                decor={
                  column.projectGlyph
                    ? projectDecor[column.projectGlyph]
                    : undefined
                }
                resolvedAccent={column.projectAccent}
                className="size-3.5"
              />
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {column.title}
              </span>
              <span className="shrink-0 text-2xs text-muted-foreground">
                {column.ordinal}
              </span>
            </span>
            <span className="flex items-center gap-1.5 text-2xs text-muted-foreground">
              <StatusGlyph
                indicator={column.statusGlyph}
                label={thread?.indicatorLabel ?? null}
              />
              <span>{relativeTimeLabel(column.elapsed, now)}</span>
            </span>
            {column.workflowRows.length > 0 ? (
              <span className="flex flex-col gap-1 border-t border-sidebar-border/60 pt-1.5">
                {column.workflowRows.map((row) => (
                  <span
                    key={row.id}
                    data-column-workflow-run-id={row.id}
                    className="flex min-w-0 items-center gap-1 text-2xs text-muted-foreground"
                  >
                    <StatusGlyph indicator="workflow" label={null} />
                    <span className="min-w-0 flex-1 truncate">{row.name}</span>
                    <span className="shrink-0">{row.status}</span>
                  </span>
                ))}
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
  );
}

export function NowRow({
  threads,
  projectNameById,
  accentFor,
  projectDecor = {},
  onNavigate,
  actions,
  now,
}: LiveStripCommonProps & { now: number }) {
  const [expanded, toggle] = useLiveStripExpanded("now");
  const { rows, overflow } = nowRows(threads);
  if (rows.length === 0) return null;

  return (
    <LiveStripSection
      label="Now"
      count={rows.length + overflow}
      expanded={expanded}
      onToggle={toggle}
    >
      <ul aria-label="Now" className="flex flex-col px-1.5 pb-2">
        {rows.map((thread) => {
          const needsYou = classifyNow(thread) === "needs-you";
          const accent = liveStripAccent(thread, accentFor, projectDecor);
          const projectName = projectNameById.get(thread.projectId) ?? "";
          const title = threadDisplayTitle(thread);
          const age = relativeTimeLabel(thread.updatedAt, now);
          const statusIndicator = nowStatusIndicator(thread, needsYou);
          const status = needsYou
            ? thread.indicatorLabel ?? "Needs you"
            : statusIndicator === "workflow"
              ? "Workflow"
              : statusIndicator === thread.indicator && thread.indicatorLabel
                ? thread.indicatorLabel
                : "Working";
          const context = projectName ? `${projectName} · ${title}` : title;
          return (
            <li key={thread.id}>
              <button
                type="button"
                data-now-thread-id={thread.id}
                data-live-strip="now"
                aria-label={`Now: ${context}, ${status}, ${age}`}
                onClick={() => {
                  actions.open(thread.id);
                  onNavigate();
                }}
                className={cn(
                  "flex w-full min-w-0 items-center gap-1.5 rounded-md px-2 py-1 text-left text-2xs hover:bg-sidebar-accent/60",
                  needsYou && "text-attention",
                )}
              >
                <StatusGlyph indicator={statusIndicator} label={null} />
                <ProjectDot accent={accent} />
                <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                  {context}
                </span>
                <span className="shrink-0 text-2xs text-muted-foreground">
                  {status}
                </span>
                <span className="ml-1 shrink-0 text-2xs text-muted-foreground">
                  · {age}
                </span>
              </button>
            </li>
          );
        })}
        {overflow > 0 ? (
          <li className="px-2 py-1 text-2xs text-muted-foreground">
            +{overflow} more
          </li>
        ) : null}
      </ul>
    </LiveStripSection>
  );
}

export function LiveStrip(props: LiveStripCommonProps & { now: number }) {
  return (
    <>
      <OpenPanesRow {...props} />
      <NowRow {...props} />
    </>
  );
}
