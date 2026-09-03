import type { CSSProperties } from "react";
import { NO_ACCENT, accentCss } from "./accent";
import { AccentPicker } from "./AccentPicker";
import {
  DEFAULT_SIDEBAR_SETTINGS,
  type AccentSource,
  type OrganizationAccess,
  type SettingsAccess,
} from "./row-props";

export interface ProjectColoursProject {
  id: string;
  name: string;
}

function projectColourSourceLabel(source: AccentSource): string {
  if (source === "project-decor") return "From project decor";
  if (source === "project") return "Manual";
  if (source === "auto") return "Auto";
  return "None";
}

/**
 * The "Project colours" settings block. It is a standalone export so it
 * compiles and tests with or without Q6's settings hook; Q6 mounts it at its
 * own `@settings:project-colours (Q2)` anchor and supplies the live values.
 */
export function ProjectColoursBlock({
  projects,
  organization,
  settings = DEFAULT_SIDEBAR_SETTINGS,
  onSettingsChange,
}: {
  projects: readonly ProjectColoursProject[];
  organization: OrganizationAccess;
  settings?: SettingsAccess;
  onSettingsChange?: (values: SettingsAccess) => void;
}) {
  return (
    <section
      aria-label="Project colours"
      className="rounded-lg border border-border"
    >
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Project colours</h3>
        <p className="text-xs text-muted-foreground">
          A manual project colour is the default for threads without their own
          or a folder colour.
        </p>
      </header>
      <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span>
          <span className="block text-foreground">
            Automatic project colours
          </span>
          <span className="block text-xs text-muted-foreground">
            Give every remaining project a stable palette colour.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Automatic project colours"
          checked={settings.autoProjectColours}
          disabled={!onSettingsChange}
          onChange={(event) =>
            onSettingsChange?.({
              ...settings,
              autoProjectColours: event.target.checked,
            })
          }
        />
      </label>
      {projects.length > 0 ? (
        projects.map((project) => {
          const effective = organization.projectAccentFor(project.id);
          const manual = organization.manualProjectAccentFor(project.id);
          const hasManual = Boolean(accentCss(manual));
          return (
            <div
              key={project.id}
              data-project-colour-row={project.id}
              className="flex items-start justify-between gap-3 border-t border-border px-4 py-3"
            >
              <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                {project.name}
              </span>
              <div className="w-64 space-y-2">
                <div className="flex items-center justify-end gap-2 text-2xs text-muted-foreground">
                  <span
                    aria-hidden="true"
                    data-project-colour-swatch={project.id}
                    className="size-2.5 rounded-full border border-border [background:var(--project-colour-swatch)]"
                    style={
                      effective.css
                        ? ({
                            "--project-colour-swatch": effective.css,
                          } as CSSProperties)
                        : undefined
                    }
                  />
                  <span>{projectColourSourceLabel(effective.source)}</span>
                </div>
                <AccentPicker
                  value={manual ?? NO_ACCENT}
                  onChange={(accent) =>
                    void organization.actions.setProjectAccent({
                      projectId: project.id,
                      ...accent,
                    })
                  }
                />
                <button
                  type="button"
                  disabled={!hasManual}
                  onClick={() =>
                    void organization.actions.setProjectAccent({
                      projectId: project.id,
                      colorIndex: 0,
                      customColor: null,
                    })
                  }
                  className="text-2xs font-medium text-muted-foreground hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
                >
                  Clear manual override
                </button>
              </div>
            </div>
          );
        })
      ) : (
        <p className="px-4 py-3 text-xs text-muted-foreground">
          No projects available.
        </p>
      )}
    </section>
  );
}
