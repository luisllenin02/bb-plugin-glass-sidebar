// Extension rule for Q2-Q6: leave every anchor comment in place.
// Insert content immediately after your own anchor.
// Never edit, move, or reorder another packet's anchor.
import type { ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import {
  experimental_useSidebarThreadActions as useSidebarThreadActions,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import { threadDisplayTitle } from "./inbox";
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
  projectIconsAvailable = false,
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
}) {
  const actions = useSidebarThreadActions();

  return (
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
          {/* @menu:organization (Q2) */}
          {/* @menu:lifecycle (Q5) */}
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
