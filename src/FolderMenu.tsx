import { useRef, useState, type ReactNode } from "react";
import * as ContextMenu from "@radix-ui/react-context-menu";
import { AccentPicker } from "./AccentPicker";
import { Icon } from "./components/Icon";
import { cn } from "./lib/utils";
import type { Folder } from "./organization";
import type { OrganizationActionsAccess } from "./row-props";

export function FolderMenu({
  folder,
  actions,
  onRename,
  onNewThread,
  children,
}: {
  folder: Folder;
  actions: OrganizationActionsAccess;
  onRename: () => void;
  onNewThread: () => void;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  // Built on open, like the row menu: a shelf of folders should not carry a
  // menu tree per header on every render.
  const [open, setOpen] = useState(false);
  const openAtButton = (button: HTMLButtonElement) => {
    const rect = button.getBoundingClientRect();
    triggerRef.current?.dispatchEvent(
      new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        clientX: rect.right,
        clientY: rect.bottom,
      }),
    );
  };

  return (
    <ContextMenu.Root onOpenChange={setOpen}>
      <ContextMenu.Trigger asChild>
        <div ref={triggerRef} className="group/folder relative">
          {children}
          <button
            type="button"
            aria-label={`Folder actions for ${folder.name}`}
            onPointerDown={(event) => event.stopPropagation()}
            onClick={(event) => {
              event.preventDefault();
              event.stopPropagation();
              openAtButton(event.currentTarget);
            }}
            className="absolute right-2 top-1/2 z-20 grid size-6 -translate-y-1/2 place-items-center rounded text-muted-foreground opacity-0 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 group-hover/folder:opacity-100"
          >
            <Icon name="Edit" className="size-3.5" />
          </button>
        </div>
      </ContextMenu.Trigger>
      {open ? (
      <ContextMenu.Portal>
        <ContextMenu.Content
          aria-label={`Actions for folder ${folder.name}`}
          className="z-50 min-w-48 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <Item onSelect={() => globalThis.setTimeout(onRename, 0)}>
            Rename
          </Item>
          <ColourSubmenu
            folder={folder}
            onChange={(value) =>
              void actions.setFolderColor({ folderId: folder.id, ...value })
            }
          />
          <Item
            onSelect={() =>
              void actions.setFolderCollapsed({
                folderId: folder.id,
                collapsed: !folder.collapsed,
              })
            }
          >
            {folder.collapsed ? "Expand" : "Collapse"}
          </Item>
          <Item onSelect={onNewThread}>New thread here</Item>
          <Separator />
          <Item destructive onSelect={() => void actions.deleteFolder({ folderId: folder.id })}>
            Dissolve folder
          </Item>
        </ContextMenu.Content>
      </ContextMenu.Portal>
      ) : null}
    </ContextMenu.Root>
  );
}

function ColourSubmenu({
  folder,
  onChange,
}: {
  folder: Folder;
  onChange: (value: { colorIndex: number; customColor: string | null }) => void;
}) {
  return (
    <ContextMenu.Sub>
      <ContextMenu.SubTrigger className={itemClassName()}>
        Colour
        <Icon name="ChevronRight" className="ml-auto size-4 opacity-60" />
      </ContextMenu.SubTrigger>
      <ContextMenu.Portal>
        <ContextMenu.SubContent
          aria-label={`Colour for ${folder.name}`}
          sideOffset={4}
          className="z-50 w-64 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-md"
        >
          <AccentPicker value={folder} onChange={onChange} />
        </ContextMenu.SubContent>
      </ContextMenu.Portal>
    </ContextMenu.Sub>
  );
}

function itemClassName(destructive = false): string {
  return cn(
    "flex cursor-pointer items-center rounded-md px-2 py-1.5 text-sm outline-none",
    "data-[state=open]:bg-accent data-[highlighted]:bg-accent data-[highlighted]:text-accent-foreground",
    "data-[disabled]:cursor-not-allowed data-[disabled]:opacity-50",
    destructive && "text-destructive-text",
  );
}

function Item({
  children,
  destructive = false,
  onSelect,
}: {
  children: ReactNode;
  destructive?: boolean;
  onSelect: () => void;
}) {
  return (
    <ContextMenu.Item onSelect={onSelect} className={itemClassName(destructive)}>
      {children}
    </ContextMenu.Item>
  );
}

function Separator() {
  return <ContextMenu.Separator className="my-1 h-px bg-border" />;
}
