import {
  Fragment,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { accentCss, accentWash } from "./accent";
import { FolderMenu } from "./FolderMenu";
import type { FolderEntry } from "./folder-list";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import type { Folder } from "./organization";
import { ProjectGlyph } from "./ProjectGlyph";
import type { OrganizationAccess, ProjectDecorEntry } from "./row-props";
import type { FolderDragApi } from "./useFolderDrag";

const NO_PROJECT_DECOR: Readonly<Record<string, ProjectDecorEntry>> =
  Object.freeze({});

export function FolderShelf({
  entries,
  organization,
  drag,
  renderThread,
  activeProjectId,
  renamingFolderId,
  onRenamingFolderChange,
  onNewThread,
  accentForFolder,
  projectDecor = NO_PROJECT_DECOR,
}: {
  entries: readonly FolderEntry<PluginSidebarThread>[];
  organization: OrganizationAccess;
  drag: FolderDragApi;
  /**
   * The list renders the card itself, drag controls included: it already has
   * to compose folder and shelf reordering per row, so the shelf does not
   * build a second set of controls the caller would throw away.
   */
  renderThread: (thread: PluginSidebarThread) => ReactNode;
  activeProjectId: string | null;
  renamingFolderId: string | null;
  onRenamingFolderChange: (folderId: string | null) => void;
  onNewThread: (projectId: string | undefined) => void;
  accentForFolder?: (
    folder: Folder,
    members: readonly PluginSidebarThread[],
  ) => string | undefined;
  /**
   * Q4's decor map, forwarded by the list from its shared `decor` binding.
   * Empty until Q4 lands, in which case the header falls back to the folder's
   * own accent dot.
   */
  projectDecor?: Readonly<Record<string, ProjectDecorEntry>>;
}) {
  if (entries.length === 0) return null;

  return (
    <section aria-label="Folders" className="mt-2 flex flex-col gap-1.5">
      {entries.map(({ folder, members }) => {
        const projectId = members[0]?.projectId ?? activeProjectId ?? undefined;
        const newThread = () => onNewThread(projectId);
        const controls = drag.folderControls(folder.id);
        const headerTarget =
          drag.target?.kind === "folder" && drag.target.folderId === folder.id;
        return (
          <div
            key={folder.id}
            data-folder-container-id={folder.id}
            className={cn(
              "rounded-lg border border-sidebar-border/30",
              controls.isDragging && "opacity-50",
            )}
          >
            <FolderMenu
              folder={folder}
              actions={organization.actions}
              onRename={() => onRenamingFolderChange(folder.id)}
              onNewThread={newThread}
            >
              <FolderHeader
                folder={folder}
                accent={accentForFolder?.(folder, members)}
                decor={
                  members[0] ? projectDecor[members[0].projectId] ?? null : null
                }
                controls={controls}
                editing={renamingFolderId === folder.id}
                highlighted={headerTarget}
                onEditingChange={(editing) =>
                  onRenamingFolderChange(editing ? folder.id : null)
                }
                onRename={(name) =>
                  void organization.actions.renameFolder({
                    folderId: folder.id,
                    name,
                  })
                }
                onToggle={() =>
                  void organization.actions.setFolderCollapsed({
                    folderId: folder.id,
                    collapsed: !folder.collapsed,
                  })
                }
              />
            </FolderMenu>
            {!folder.collapsed ? (
              <>
                <ul className="flex flex-col gap-px pl-2">
                  {members.map((thread) => {
                    const isTarget =
                      drag.target?.kind === "thread" &&
                      drag.target.threadId === thread.id;
                    const before =
                      isTarget && drag.target?.placement === "before";
                    const after = isTarget && drag.target?.placement === "after";
                    return (
                      <Fragment key={thread.id}>
                        {before ? <InsertionLine /> : null}
                        {renderThread(thread)}
                        {after ? <InsertionLine /> : null}
                      </Fragment>
                    );
                  })}
                </ul>
                <button
                  type="button"
                  onClick={newThread}
                  className="flex w-full items-center px-3 py-1.5 text-left text-xs text-muted-foreground hover:bg-sidebar-accent/60 hover:text-foreground"
                >
                  + New thread
                </button>
              </>
            ) : null}
          </div>
        );
      })}
    </section>
  );
}

export function FolderHeader({
  folder,
  accent,
  decor = null,
  controls,
  editing,
  highlighted,
  onEditingChange,
  onRename,
  onToggle,
}: {
  folder: Folder;
  accent?: string;
  /** Decor of the folder's first member project, when Q4 has supplied one. */
  decor?: ProjectDecorEntry | null;
  controls: ReturnType<FolderDragApi["folderControls"]>;
  editing: boolean;
  highlighted: boolean;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
  onToggle: () => void;
}) {
  const colour = accent ?? accentCss(folder);
  const wash = accentWash(colour);
  return (
    <div
      className={cn(
        "relative rounded-md transition-colors",
        highlighted && "ring-1 ring-primary/50",
      )}
      style={wash ? { background: wash } : undefined}
    >
      <button
        type="button"
        data-folder-id={folder.id}
        aria-label={`${folder.collapsed ? "Expand" : "Collapse"} ${folder.name}`}
        aria-expanded={!folder.collapsed}
        aria-keyshortcuts="Alt+ArrowUp Alt+ArrowDown"
        onPointerDown={controls.onPointerDown}
        onKeyDown={controls.onKeyDown}
        onClick={() => {
          if (!editing) onToggle();
        }}
        onDoubleClick={(event) => {
          event.preventDefault();
          event.stopPropagation();
          onEditingChange(true);
        }}
        className="absolute inset-0 z-0 w-full cursor-grab rounded-md outline-none focus-visible:ring-2 focus-visible:ring-ring active:cursor-grabbing"
      />
      <div className="pointer-events-none relative z-10 flex min-h-9 items-center gap-2 px-2.5 pr-10 text-sm">
        <Icon
          name={folder.collapsed ? "ChevronRight" : "ChevronDown"}
          aria-hidden
          className="size-3.5 shrink-0 text-muted-foreground"
        />
        {decor ? (
          <ProjectGlyph
            decor={decor}
            resolvedAccent={colour}
            className="size-3.5"
          />
        ) : (
          <span
            aria-hidden="true"
            className={cn(
              "size-2.5 shrink-0 rounded-full border border-sidebar-border",
              !colour && "bg-muted",
            )}
            style={colour ? { background: colour } : undefined}
          />
        )}
        <FolderName
          folder={folder}
          editing={editing}
          onEditingChange={onEditingChange}
          onRename={onRename}
        />
        <span className="ml-auto text-2xs tabular-nums text-muted-foreground">
          {folder.threadIds.length}
        </span>
      </div>
    </div>
  );
}

function FolderName({
  folder,
  editing,
  onEditingChange,
  onRename,
}: {
  folder: Folder;
  editing: boolean;
  onEditingChange: (editing: boolean) => void;
  onRename: (name: string) => void;
}) {
  const [draft, setDraft] = useState(folder.name);
  const finished = useRef(false);
  useEffect(() => {
    if (!editing) return;
    setDraft(folder.name);
    finished.current = false;
  }, [editing, folder.name]);

  if (!editing) {
    return (
      <span className="min-w-0 flex-1 truncate font-medium">{folder.name}</span>
    );
  }

  const finish = (save: boolean) => {
    if (finished.current) return;
    finished.current = true;
    onEditingChange(false);
    const name = draft.trim();
    if (save && name && name !== folder.name) onRename(name);
  };
  return (
    <input
      autoFocus
      aria-label={`Rename folder ${folder.name}`}
      value={draft}
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onClick={(event) => event.stopPropagation()}
      onChange={(event) => setDraft(event.target.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") {
          event.preventDefault();
          finish(true);
        } else if (event.key === "Escape") {
          event.preventDefault();
          finish(false);
        }
      }}
      onBlur={() => finish(true)}
      className="pointer-events-auto relative z-20 h-7 min-w-0 flex-1 rounded border border-border bg-background px-1.5 text-sm text-foreground outline-none focus:ring-1 focus:ring-ring"
    />
  );
}

function InsertionLine() {
  return (
    <li aria-hidden="true" className="list-none px-2 py-px">
      <span className="block h-px bg-primary/50" />
    </li>
  );
}
