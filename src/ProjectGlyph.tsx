import type { CSSProperties } from "react";
import { Icon } from "./components/Icon";
import type { ProjectDecorEntry } from "./row-props";

/** Q1 fallback; Q4 replaces the drawing path with the owned decor catalog. */
export function ProjectGlyph({
  resolvedAccent,
  projectAccent,
  className,
}: {
  decor?: ProjectDecorEntry | null;
  faviconUrl?: string | null;
  projectAccent?: string;
  resolvedAccent?: string;
  className?: string;
}) {
  const color = resolvedAccent ?? projectAccent;
  return (
    <span
      data-project-glyph-source="folder"
      className="inline-flex shrink-0 items-center justify-center"
      style={color ? ({ "--project-glyph-color": color, color } as CSSProperties) : undefined}
    >
      <Icon name="Folder" className={className} aria-hidden />
    </span>
  );
}
