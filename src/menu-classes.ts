import { cn } from "./lib/utils";

/**
 * bb's own menu classes, copied from its thread-actions menu (measured live
 * 2026-09-24): 6 px panel radius, 4 px item radius, 12 px text, 26 px items,
 * and the host's enter/exit animation. The SDK exposes no menu primitive, so
 * the row and folder menus wear the host's classes rather than a near miss of
 * their own (theirs were 8/6 px, 14 px text, 31 px items, no motion).
 */
export const MENU_CONTENT_CLASS = cn(
  "z-50 overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md",
  "data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
  "data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2",
);

export function menuItemClass(destructive = false): string {
  return cn(
    "relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-[0.3125rem] text-xs outline-none transition-none",
    "focus:bg-state-hover focus:text-foreground data-[highlighted]:bg-state-hover data-[highlighted]:text-foreground data-[state=open]:bg-state-hover",
    "data-[disabled]:pointer-events-none data-[disabled]:opacity-50",
    destructive &&
      "text-destructive-text focus:text-destructive-text data-[highlighted]:text-destructive-text",
  );
}

export const MENU_SEPARATOR_CLASS = "-mx-1 my-1 h-px bg-muted";
