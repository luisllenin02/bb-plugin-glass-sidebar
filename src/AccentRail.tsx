import { cn } from "./lib/utils";
import { railOpacity, showAccentRail, type PaneState } from "./pane-state";

/**
 * The row's left rail: the one mark that says "this thread is on screen" (and,
 * when the user gave it a colour, which folder or project it belongs to)
 * without spending a pixel of the row's content width.
 *
 * Colour and opacity are inline rather than Tailwind because both are values
 * the plugin's Tailwind pass cannot emit: `--thread-accent` is user-picked, and
 * arbitrary-value utilities are not compiled into the plugin bundle. The
 * technique — inline `style` from a host custom property — follows Tinted
 * Threads (grrowl/bb-tinted-threads, MIT).
 */
export function AccentRail({
  state,
  hasAccent = false,
  className,
}: {
  state: PaneState;
  /** The row carries a resolved `--thread-accent`. */
  hasAccent?: boolean;
  className?: string;
}) {
  if (!showAccentRail(state, hasAccent)) return null;
  return (
    <span
      aria-hidden="true"
      data-accent-rail={state}
      className={cn(
        "pointer-events-none absolute inset-y-0 left-0.5 rounded-full",
        className,
      )}
      style={{
        width: 3,
        background: "var(--thread-accent, var(--primary))",
        opacity: railOpacity(state),
      }}
    />
  );
}
