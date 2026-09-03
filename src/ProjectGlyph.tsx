import type { CSSProperties } from "react";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";
import { projectIconColorCss } from "./accent";
import { Icon } from "./components/Icon";
import type { ProjectDecorEntry } from "./row-props";

/** Q1 fallback; Q4 replaces the drawing path with the owned decor catalog. */
export function ProjectGlyph({
  decor,
  faviconUrl,
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
  const projectColor =
    projectIconColorCss(decor?.iconColor ?? null) ?? projectAccent;
  const fallbackColor = resolvedAccent ?? projectAccent;
  const styleFor = (color: string | undefined): CSSProperties | undefined =>
    color
      ? ({ "--project-glyph-color": color, color } as CSSProperties)
      : undefined;

  if (decor?.icon && decor.glyph && decor.glyph.length > 0) {
    return (
      <span
        aria-hidden="true"
        data-project-glyph-source="project-decor"
        data-project-icon={decor.icon}
        className="inline-flex shrink-0 items-center justify-center"
        style={styleFor(projectColor)}
      >
        <HugeiconsIcon
          icon={decor.glyph as IconSvgElement}
          className={className}
        />
      </span>
    );
  }

  if (faviconUrl) {
    return (
      <img
        src={faviconUrl}
        alt=""
        aria-hidden="true"
        data-project-glyph-source="favicon"
        className={className}
      />
    );
  }

  return (
    <span
      data-project-glyph-source="folder"
      className="inline-flex shrink-0 items-center justify-center"
      style={styleFor(fallbackColor)}
    >
      <Icon name="Folder" className={className} aria-hidden />
    </span>
  );
}
