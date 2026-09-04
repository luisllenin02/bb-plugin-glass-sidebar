import * as React from "react";
import * as TooltipPrimitive from "@radix-ui/react-tooltip";
import { cn } from "../lib/utils";
import { usePortalScopeProps } from "../lib/portal-scope";

const DELAY_DURATION = 250;
const SKIP_DELAY_DURATION = 100;

/**
 * True when a `TooltipProvider` is already mounted above.
 *
 * Radix's provider is per-tree state (delay timers), not per-tooltip, but it
 * throws if a `Root` cannot find one. A row draws two or three tooltips, so
 * mounting a provider inside every `Tooltip` cost four refs, an effect and
 * three callbacks per tooltip per row. The list mounts one provider and this
 * flag lets `Tooltip` skip its own; a tooltip rendered outside a provider
 * still supplies one, so no caller has to know.
 */
const TooltipScopeContext = React.createContext(false);

export function TooltipProvider({ children }: { children: React.ReactNode }) {
  return (
    <TooltipPrimitive.Provider
      delayDuration={DELAY_DURATION}
      skipDelayDuration={SKIP_DELAY_DURATION}
    >
      <TooltipScopeContext.Provider value={true}>
        {children}
      </TooltipScopeContext.Provider>
    </TooltipPrimitive.Provider>
  );
}

export function Tooltip({
  label,
  children,
  side = "top",
  className,
}: {
  label: string;
  children: React.ReactElement;
  side?: React.ComponentPropsWithoutRef<
    typeof TooltipPrimitive.Content
  >["side"];
  className?: string;
}) {
  const hasProvider = React.useContext(TooltipScopeContext);
  const tooltip = (
    <TooltipPrimitive.Root>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          {...usePortalScopeProps()}
          side={side}
          sideOffset={6}
          className={cn(
            "pointer-events-none z-50 max-w-64 rounded-md border border-border bg-popover px-2 py-1 text-xs text-popover-foreground shadow-md",
            "data-[state=delayed-open]:animate-in data-[state=delayed-open]:fade-in-0 data-[state=closed]:animate-out data-[state=closed]:fade-out-0",
            className,
          )}
        >
          {label}
          <TooltipPrimitive.Arrow className="fill-popover" />
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
  if (hasProvider) return tooltip;
  return <TooltipProvider>{tooltip}</TooltipProvider>;
}
