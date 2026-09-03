import { projectIconColorCss } from "./accent";
import type { ProjectDecorMap } from "./project-decor";
import type { SettingsAccess } from "./row-props";

export function ProjectDecorBlock({
  settings,
  projects,
  projectNames,
  onAutoProjectColoursChange,
}: {
  settings: SettingsAccess;
  projects: Readonly<ProjectDecorMap>;
  projectNames: Readonly<Record<string, string>>;
  onAutoProjectColoursChange(value: boolean): void;
}) {
  return (
    <section aria-labelledby="project-decor-heading" className="space-y-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 id="project-decor-heading" className="text-sm font-medium">
            Project icons &amp; colours
          </h3>
          <p className="text-xs text-muted-foreground">
            Automatic choices are local, deterministic, and owned by Glass Sidebar.
          </p>
        </div>
        <label className="flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={settings.autoProjectColours}
            onChange={(event) => onAutoProjectColoursChange(event.target.checked)}
          />
          Auto colours
        </label>
      </div>
      <ul className="space-y-1">
        {Object.entries(projects).map(([projectId, entry]) => (
          <li
            key={projectId}
            className="flex items-center gap-2 rounded-md border border-border/60 px-2 py-1.5 text-xs"
          >
            <span
              aria-hidden="true"
              className="size-2.5 rounded-full"
              style={{ backgroundColor: projectIconColorCss(entry.iconColor ?? null) }}
            />
            <span className="min-w-0 flex-1 truncate">
              {projectNames[projectId] ?? projectId}
            </span>
            <span className="text-muted-foreground">
              {entry.source === "manual" ? "Manual" : "Auto"}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
