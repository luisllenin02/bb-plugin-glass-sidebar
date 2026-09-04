import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  ACCENT_NAMES,
  ACCENT_PALETTE,
  accentCss,
  parseCustomHex,
  type AccentValue,
} from "./accent";
import { cn } from "./lib/utils";

export function accentValueFromCss(css: string | undefined): AccentValue {
  if (!css) return { colorIndex: 0, customColor: null };
  const colorIndex = ACCENT_PALETTE.findIndex((candidate) => candidate === css);
  if (colorIndex >= 0) return { colorIndex, customColor: null };
  return { colorIndex: 0, customColor: parseCustomHex(css) };
}

/** Compact, shared palette for folder, thread, and project accents. */
export function AccentPicker({
  value,
  onChange,
  includeNone = true,
  className,
}: {
  value: AccentValue;
  onChange: (value: AccentValue) => void;
  includeNone?: boolean;
  className?: string;
}) {
  const selectedCss = accentCss(value);
  const [customDraft, setCustomDraft] = useState(value.customColor ?? "");
  const [customInvalid, setCustomInvalid] = useState(false);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const choices = useMemo(
    () =>
      includeNone
        ? ACCENT_PALETTE.map((color, colorIndex) => ({ color, colorIndex }))
        : ACCENT_PALETTE.slice(1).map((color, index) => ({
            color,
            colorIndex: index + 1,
          })),
    [includeNone],
  );

  useEffect(() => {
    setCustomDraft(value.customColor ?? "");
    setCustomInvalid(false);
  }, [value.customColor]);

  const moveFocus = (
    event: KeyboardEvent<HTMLButtonElement>,
    index: number,
  ) => {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const offset = event.key === "ArrowLeft" ? -1 : 1;
    const next = (index + offset + choices.length) % choices.length;
    buttonRefs.current[next]?.focus();
  };

  const commitCustom = () => {
    const parsed = parseCustomHex(customDraft);
    setCustomInvalid(parsed === null && customDraft.trim().length > 0);
    if (parsed) onChange({ colorIndex: 0, customColor: parsed });
  };

  return (
    <div className={cn("space-y-2 p-1", className)}>
      <div
        role="group"
        aria-label="Accent colours"
        className="flex items-center gap-1"
      >
        {choices.map(({ color, colorIndex }, index) => {
          const selected =
            value.customColor === null && selectedCss === color;
          const name = ACCENT_NAMES[colorIndex] ?? `colour ${colorIndex}`;
          return (
            <button
              key={colorIndex}
              ref={(node) => {
                buttonRefs.current[index] = node;
              }}
              type="button"
              aria-label={name === "none" ? "No colour" : `${name} colour`}
              aria-pressed={selected}
              onKeyDown={(event) => {
                moveFocus(event, index);
                if (event.key === "Enter") {
                  event.preventDefault();
                  onChange({ colorIndex, customColor: null });
                }
              }}
              onClick={() => onChange({ colorIndex, customColor: null })}
              className={cn(
                "grid size-6 shrink-0 place-items-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring",
                selected && "ring-2 ring-foreground/70 ring-offset-1 ring-offset-popover",
              )}
            >
              <span
                aria-hidden="true"
                className={cn(
                  "grid size-4 place-items-center rounded-full border border-border text-2xs text-muted-foreground",
                  colorIndex === 0 && "bg-background",
                )}
                style={color ? { background: color } : undefined}
              >
                {colorIndex === 0 ? "×" : null}
              </span>
            </button>
          );
        })}
      </div>
      <div className="flex items-center gap-2">
        <input
          aria-label="Custom colour"
          aria-invalid={customInvalid || undefined}
          placeholder="#rrggbb"
          value={customDraft}
          onChange={(event) => {
            setCustomDraft(event.target.value);
            setCustomInvalid(false);
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              commitCustom();
            }
          }}
          onBlur={commitCustom}
          className="h-7 min-w-0 flex-1 rounded-md border border-border bg-background px-2 font-mono text-xs text-foreground outline-none focus:ring-1 focus:ring-ring aria-[invalid=true]:border-destructive"
        />
        {value.customColor ? (
          <span
            aria-hidden="true"
            className="size-4 shrink-0 rounded-full border border-border"
            style={{ background: value.customColor }}
          />
        ) : null}
      </div>
    </div>
  );
}
