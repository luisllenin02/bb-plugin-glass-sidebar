// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import { useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Icon } from "./components/Icon";
import { AccentPicker, accentValueFromCss } from "./AccentPicker";
import { cn } from "./lib/utils";
import { usePortalScopeProps } from "./lib/portal-scope";
import {
  MENU_CONTENT_CLASS,
  MENU_SEPARATOR_CLASS,
  menuItemClass,
} from "./menu-classes";
import { threadDisplayTitle } from "./inbox";
import { uniqueFolderName } from "./organization";
import { IconPicker } from "./IconPicker";
import type { ProjectDecorEntry } from "./row-props";
import type {
  ConfiguredSnoozePreset,
  DecorAccess,
  LifecycleAccess,
  OrganizationAccess,
} from "./row-props";

/** The packet-Q1 base menu; later packets extend it at the owned anchors. */
export function RowContextMenu({
  thread,
  children,
  canSnooze = false,
  canArchive = true,
  snoozePresets = [],
  onSnooze,
  onSettle,
  onUnsettle,
  onWake,
  onRename,
  organization,
  decor,
  lifecycle,
  onFolderCreated,
  projectName,
  projectDecor,
}: {
  thread: PluginSidebarThread;
  children: ReactNode;
  canSnooze?: boolean;
  canArchive?: boolean;
  snoozePresets?: readonly ConfiguredSnoozePreset[];
  onSnooze?: (snoozedUntil: number) => void;
  onSettle?: () => void;
  onUnsettle?: () => void;
  onWake?: () => void;
  onRename?: () => void;
  organization?: OrganizationAccess;
  decor?: DecorAccess;
  lifecycle?: LifecycleAccess;
  onFolderCreated?: (folderId: string) => void;
  projectIconsAvailable?: boolean;
  projectName?: string | null;
  projectDecor?: ProjectDecorEntry | null;
}) {
  const actions = useSidebarThreadActions();
  const portalScope = usePortalScopeProps();
  const [open, setOpen] = useState(false);
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  // Every row wraps itself in this menu, so nothing here may cost anything
  // until the menu is actually open: the items, the four submenus and the
  // icon picker are built on open and thrown away on close.
  const folder = open ? organization?.folderOf(thread.id) ?? null : null;
  const effectiveDecor = projectDecor ?? decor?.decorFor(thread.projectId) ?? null;

  return (
    <>
      <ContextMenu.Root onOpenChange={setOpen}>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      {open ? (
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Thread actions"
          {...portalScope}
          className={cn(MENU_CONTENT_CLASS, "min-w-44")}
        >
          <Item onSelect={() => actions.open(thread.id, { split: false })}>
            Open
          </Item>
          <Item onSelect={() => actions.open(thread.id, { split: true })}>
            Open in split
          </Item>
          <Separator />
          <Item
            onSelect={() => void actions.setPinned(thread.id, !thread.isPinned)}
          >
            {thread.isPinned ? "Unpin" : "Pin"}
          </Item>
          {onRename ? (
            <Item onSelect={() => globalThis.setTimeout(onRename, 0)}>
              Rename
            </Item>
          ) : null}
          <CopySubmenu thread={thread} />
          {/* @menu:decor (Q4) */}
          <Item onSelect={() => setProjectPickerOpen(true)}>
            Project icon &amp; colour…
          </Item>
          {/* @menu:organization (Q2) */}
          {organization ? (
            <>
              <MoveToFolderSubmenu
                thread={thread}
                organization={organization}
                onFolderCreated={onFolderCreated}
              />
              {folder ? (
                <Item
                  onSelect={() =>
                    void organization.actions.moveThreadToFolder({
                      threadId: thread.id,
                      folderId: null,
                    })
                  }
                >
                  Remove from folder
                </Item>
              ) : null}
              <ThreadColourSubmenu thread={thread} organization={organization} />
            </>
          ) : null}
          {/* @menu:lifecycle (Q5) */}
          {onSettle ? <Item onSelect={onSettle}>Settle</Item> : null}
          {onUnsettle ? <Item onSelect={onUnsettle}>Un-settle</Item> : null}
          {canSnooze && onSnooze && snoozePresets.length > 0 ? (
            <SnoozeSubmenu presets={snoozePresets} onSnooze={onSnooze} />
          ) : null}
          {onWake ? <Item onSelect={onWake}>Wake now</Item> : null}
          <Separator />
          <Item
            onSelect={() => void actions.setRead(thread.id, thread.isUnread)}
          >
            {thread.isUnread ? "Mark read" : "Mark unread"}
          </Item>
          <Item
            disabled={!canArchive}
            onSelect={() => actions.archive(thread.id)}
          >
            Archive
          </Item>
          <Item destructive onSelect={() => actions.requestDelete(thread.id)}>
            Delete
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
      ) : null}
      </ContextMenu.Root>
      {projectPickerOpen ? (
        <IconPicker
          open
          onOpenChange={setProjectPickerOpen}
          projectId={thread.projectId}
          projectName={projectName ?? thread.projectId}
          decor={effectiveDecor}
        />
      ) : null}
    </>
  );
}

function MoveToFolderSubmenu({
  thread,
  organization,
  onFolderCreated,
}: {
  thread: PluginSidebarThread;
  organization: OrganizationAccess;
  onFolderCreated?: (folderId: string) => void;
}) {
  const portalScope = usePortalScopeProps();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={submenuTriggerClassName}>
        Move to folder
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          aria-label="Move to folder"
          sideOffset={4}
          {...portalScope}
          className={cn(MENU_CONTENT_CLASS, "min-w-44")}
        >
          {organization.folders.map((folder) => (
            <Item
              key={folder.id}
              disabled={organization.folderOf(thread.id)?.id === folder.id}
              onSelect={() =>
                void organization.actions.moveThreadToFolder({
                  threadId: thread.id,
                  folderId: folder.id,
                })
              }
            >
              {folder.name}
            </Item>
          ))}
          {organization.folders.length > 0 ? <Separator /> : null}
          <Item
            onSelect={() => {
              void organization.actions
                .createFolder({
                  name: uniqueFolderName(organization.folders),
                  threadIds: [thread.id],
                })
                .then(({ folder }) => onFolderCreated?.(folder.id));
            }}
          >
            New folder…
          </Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function ThreadColourSubmenu({
  thread,
  organization,
}: {
  thread: PluginSidebarThread;
  organization: OrganizationAccess;
}) {
  const folderId = organization.folderOf(thread.id)?.id ?? null;
  const value = accentValueFromCss(organization.accentFor(thread, folderId));
  const portalScope = usePortalScopeProps();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={submenuTriggerClassName}>
        Thread colour
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          aria-label={`Colour for ${threadDisplayTitle(thread)}`}
          sideOffset={4}
          {...portalScope}
          className={cn(MENU_CONTENT_CLASS, "w-64")}
        >
          <AccentPicker
            value={value}
            onChange={(accent) =>
              void organization.actions.setThreadAccent({
                threadId: thread.id,
                ...accent,
              })
            }
          />
          <Separator />
          <Item
            onSelect={() =>
              void organization.actions.setThreadAccent({
                threadId: thread.id,
                colorIndex: 0,
                customColor: null,
              })
            }
          >
            Clear
          </Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function SnoozeSubmenu({
  presets,
  onSnooze,
}: {
  presets: readonly ConfiguredSnoozePreset[];
  onSnooze: (snoozedUntil: number) => void;
}) {
  const portalScope = usePortalScopeProps();
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={submenuTriggerClassName}>
        Snooze
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          aria-label="Snooze times"
          sideOffset={4}
          {...portalScope}
          className={cn(MENU_CONTENT_CLASS, "min-w-40")}
        >
          {presets.map((preset) => (
            <Item
              key={preset.id}
              onSelect={() => onSnooze(Date.now() + preset.durationMs)}
            >
              {preset.label}
            </Item>
          ))}
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function CopySubmenu({ thread }: { thread: PluginSidebarThread }) {
  // Mounted only while the menu is open, so the full-view hook costs no row
  // anything. The path is the host's own "Copy thread link" form (inferred
  // from bb core: personal project → /threads/<id>, else project-scoped).
  const { projects } = useSidebarThreads();
  const portalScope = usePortalScopeProps();
  const project = projects.find((p) => p.id === thread.projectId);
  const threadPath = project?.isPersonal
    ? `/threads/${thread.id}`
    : `/projects/${thread.projectId}/threads/${thread.id}`;
  const copy = (text: string) =>
    typeof navigator === "undefined" || !navigator.clipboard
      ? null
      : navigator.clipboard.writeText(text);

  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={submenuTriggerClassName}>
        Copy
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          aria-label="Copy thread data"
          sideOffset={4}
          {...portalScope}
          className={cn(MENU_CONTENT_CLASS, "min-w-40")}
        >
          <Item onSelect={() => copy(threadDisplayTitle(thread))}>
            Copy title
          </Item>
          <Item onSelect={() => copy(thread.id)}>Copy thread ID</Item>
          <Item
            onSelect={() =>
              copy(new URL(threadPath, window.location.origin).href)?.then(
                () => toast.success("Thread link copied"),
                () => {},
              )
            }
          >
            Copy thread link
          </Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

const submenuTriggerClassName = menuItemClass();

function Item({
  children,
  destructive = false,
  disabled = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  disabled?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item
      disabled={disabled}
      onSelect={onSelect}
      className={menuItemClass(destructive)}
    >
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className={MENU_SEPARATOR_CLASS} />;
}
