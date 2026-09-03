import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { useEffect, useMemo, useState } from "react";
import { useRpc } from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import {
  PROJECT_ICON_COLOR_NAMES,
  projectIconColorCss,
  type ProjectIconColorName,
} from "./accent";
import { categoryLabel, iconLabel, type CatalogEntry } from "./icon-search";
import type { ProjectDecorValue } from "./project-decor";
import type { ProjectGlyph } from "./row-props";

export interface CatalogIcon extends CatalogEntry {
  glyph: ProjectGlyph;
}

export interface AiIconSuggestionInput {
  projectName: string;
  listingNames: readonly string[];
  candidateIconNames: readonly string[];
}

export interface IconPickerProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  projectId: string;
  projectName: string;
  decor: ProjectDecorValue | null;
  topLevelListingNames?: readonly string[];
  aiSuggester?: (input: AiIconSuggestionInput) => Promise<string | null>;
}

export function IconPicker({
  open,
  onOpenChange,
  projectId,
  projectName,
  decor,
  topLevelListingNames = [],
  aiSuggester,
}: IconPickerProps) {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [icons, setIcons] = useState<CatalogIcon[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [selectedIcon, setSelectedIcon] = useState(decor?.icon ?? "folder-01");
  const [selectedColor, setSelectedColor] =
    useState<ProjectIconColorName | null>(decor?.iconColor ?? null);

  useEffect(() => {
    if (!open) return;
    setSelectedIcon(decor?.icon ?? "folder-01");
    setSelectedColor(decor?.iconColor ?? null);
  }, [decor, open]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    void rpc
      .call("listIconCatalog", { query, category })
      .then((result) => {
        if (cancelled) return;
        setIcons(result.icons as CatalogIcon[]);
        setTotal(result.total);
      })
      .catch(() => {
        if (!cancelled) {
          setIcons([]);
          setTotal(0);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [category, open, query, rpc]);

  const categories = useMemo(
    () => [...new Set(icons.map((entry) => entry.category))].sort(),
    [icons],
  );

  const save = async (icon: string, color: ProjectIconColorName | null) => {
    setBusy(true);
    try {
      await rpc.call("setProjectDecorIcon", { projectId, icon, color });
      setSelectedIcon(icon);
      setSelectedColor(color);
    } finally {
      setBusy(false);
    }
  };

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="false"
      aria-label={`Project icon and colour for ${projectName}`}
      className="fixed left-1/2 top-16 z-[70] flex max-h-[min(42rem,calc(100vh-5rem))] w-[min(38rem,calc(100vw-2rem))] -translate-x-1/2 flex-col gap-3 overflow-hidden rounded-xl border border-border bg-popover p-4 text-popover-foreground shadow-xl"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold">Project icon &amp; colour</h2>
          <p className="text-xs text-muted-foreground">{projectName}</p>
        </div>
        <button
          type="button"
          aria-label="Close project icon picker"
          onClick={() => onOpenChange(false)}
          className="rounded px-2 py-1 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          Close
        </button>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span>Icon: {iconLabel(selectedIcon)}</span>
        <span>Colour: {selectedColor ?? "theme"}</span>
        {decor?.source === "auto" ? (
          <span
            title={`${decor.autoReason ?? "Automatically selected"}${decor.autoKeywords?.length ? ` — ${decor.autoKeywords.join(", ")}` : ""}`}
            className="rounded-full bg-state-active px-1.5 py-0.5 text-[10px] font-medium text-foreground"
          >
            Auto
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={() => void rpc.call("resetProjectDecorToAuto", { projectId })}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          {decor?.source === "manual" ? "Reset to auto" : "Auto-select"}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void rpc.call("redetectAllAutoIcons", {})}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Re-detect all
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void rpc.call("clearProjectDecorIcon", { projectId })}
          className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
        >
          Clear
        </button>
        {aiSuggester ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void aiSuggester({
                projectName,
                listingNames: topLevelListingNames.slice(0, 200),
                candidateIconNames: icons.map((entry) => entry.name),
              })
                .then((icon) => {
                  if (icon) setSelectedIcon(icon);
                })
                .finally(() => setBusy(false));
            }}
            className="rounded-md border border-border px-2 py-1 text-xs hover:bg-accent disabled:opacity-50"
          >
            Suggest with AI
          </button>
        ) : null}
      </div>

      <div className="flex items-center gap-2">
        {PROJECT_ICON_COLOR_NAMES.map((color) => (
          <button
            key={color}
            type="button"
            aria-label={color}
            aria-pressed={selectedColor === color}
            disabled={busy}
            onClick={() => void save(selectedIcon, color)}
            style={{ backgroundColor: projectIconColorCss(color) }}
            className="size-5 rounded-full border border-border aria-pressed:ring-2 aria-pressed:ring-ring"
          />
        ))}
        <button
          type="button"
          disabled={busy}
          onClick={() => void save(selectedIcon, null)}
          className="rounded-md px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
        >
          Theme colour
        </button>
      </div>

      <input
        aria-label="Search project icons"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        placeholder="Search icons"
        className="h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring"
      />

      <div className="flex gap-1 overflow-x-auto">
        <CategoryButton active={category === null} onClick={() => setCategory(null)}>
          All
        </CategoryButton>
        {categories.map((name) => (
          <CategoryButton
            key={name}
            active={category === name}
            onClick={() => setCategory(category === name ? null : name)}
          >
            {categoryLabel(name)}
          </CategoryButton>
        ))}
      </div>

      <div className="grid min-h-24 grid-cols-8 gap-1 overflow-y-auto max-md:grid-cols-6">
        {icons.map((entry) => (
          <button
            key={entry.name}
            type="button"
            title={iconLabel(entry.name)}
            aria-label={iconLabel(entry.name)}
            aria-pressed={entry.name === selectedIcon}
            disabled={busy}
            onClick={() => void save(entry.name, selectedColor)}
            className="flex aspect-square items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground aria-pressed:bg-state-active aria-pressed:text-foreground"
          >
            <HugeiconsIcon icon={entry.glyph as IconSvgElement} className="size-5" />
          </button>
        ))}
      </div>
      <p className="text-xs text-muted-foreground">
        {loading ? "Loading icons…" : `${icons.length} of ${total} icons`}
      </p>
    </div>
  );
}

function CategoryButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick(): void;
  children: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`shrink-0 rounded-full px-2 py-0.5 text-xs capitalize ${
        active ? "bg-state-active text-foreground" : "text-muted-foreground"
      }`}
    >
      {children}
    </button>
  );
}
