// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import { useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { AccentPicker, accentValueFromCss } from "./AccentPicker";
import { cn } from "./lib/utils";
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
  const folder = organization?.folderOf(thread.id) ?? null;
  const [projectPickerOpen, setProjectPickerOpen] = useState(false);
  const effectiveDecor = projectDecor ?? decor?.decorFor(thread.projectId) ?? null;

  return (
    <>
      <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label="Thread actions"
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
      </ContextMenu.Root>
      <IconPicker
        open={projectPickerOpen}
        onOpenChange={setProjectPickerOpen}
        projectId={thread.projectId}
        projectName={projectName ?? thread.projectId}
        decor={effectiveDecor}
      />
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
          className="z-50 min-w-44 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
          className="z-50 w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
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
  const copy = (text: string) => {
    if (typeof navigator === "undefined" || !navigator.clipboard) return;
    void navigator.clipboard.writeText(text);
  };

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
          className="z-50 min-w-40 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Item onSelect={() => copy(threadDisplayTitle(thread))}>
            Copy title
          </Item>
          <Item onSelect={() => copy(thread.id)}>Copy thread ID</Item>
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

const submenuTriggerClassName = cn(
  "flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none",
  "data-[state=open]:bg-accent data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
);

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
      className={cn(
        "cursor-pointer rounded-md px-2 py-1.5 text-sm outline-none",
        "data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
        "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
        destructive && "text-destructive-text",
      )}
    >
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
