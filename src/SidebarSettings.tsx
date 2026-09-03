import { useEffect, useState, type ReactNode } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { glassSidebarRpcContract } from "../server";
import {
  ACTIVE_SORT_LABELS,
  ACTIVE_SORT_MODES,
  ACTIVE_SORT_STORAGE_KEY,
  isActiveSortMode,
  readActiveSort,
} from "./active-sorting";
import { ProjectColoursBlock } from "./ProjectColoursBlock";
import { ProjectDecorBlock } from "./ProjectDecorBlock";
import { ProjectIconSettings } from "./ProjectIconSettings";
import { LifecycleBlock } from "./LifecycleBlock";
import {
  cacheSidebarSettings,
  type SidebarSettingsValues,
} from "./sidebar-settings";
import { useOrganization } from "./useOrganization";
import { useProjectDecor } from "./useProjectDecor";
import { useSidebarSettings } from "./useSidebarSettings";

function SettingsGroup({
  children,
  description,
  title,
}: {
  children: ReactNode;
  description: string;
  title: string;
}) {
  return (
    <section aria-label={title} className="rounded-lg border border-border">
      <header className="border-b border-border px-4 py-3">
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <p className="mt-1 text-xs text-muted-foreground">{description}</p>
      </header>
      <div className="px-4 py-3">{children}</div>
    </section>
  );
}

export function SidebarSettings() {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const { projects } = useSidebarThreads();
  const liveSettings = useSidebarSettings();
  const organization = useOrganization();
  const decor = useProjectDecor();
  const [saved, setSaved] = useState<SidebarSettingsValues>(liveSettings);
  const [draft, setDraft] = useState<SidebarSettingsValues>(liveSettings);
  const [saving, setSaving] = useState(false);
  const [sortMode, setSortMode] = useState(readActiveSort);
  const dirty = JSON.stringify(saved) !== JSON.stringify(draft);

  useEffect(() => {
    if (!dirty) {
      setSaved(liveSettings);
      setDraft(liveSettings);
    }
  }, [dirty, liveSettings]);

  const save = async () => {
    if (!dirty || saving) return;
    setSaving(true);
    try {
      const result = await rpc.call("updateSidebarSettings", draft);
      const cached = cacheSidebarSettings(rpc, result);
      setSaved(cached);
      setDraft(cached);
      toast.success("Glass Sidebar settings saved");
    } catch (error) {
      toast.error("Could not save sidebar settings", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-3xl space-y-8 pb-4">
      <SettingsGroup
        title="Active thread order"
        description="Choose the ordering used by the Active shelf. Manual order keeps drag and keyboard reordering enabled."
      >
        <label className="grid gap-1.5 text-xs font-medium text-foreground">
          Sort active threads
          <select
            aria-label="Sort active threads"
            value={sortMode}
            onChange={(event) => {
              if (!isActiveSortMode(event.target.value)) return;
              const next = event.target.value;
              setSortMode(next);
              try {
                window.localStorage.setItem(ACTIVE_SORT_STORAGE_KEY, next);
              } catch {
                // The selection remains effective for this settings mount.
              }
            }}
            className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
          >
            {ACTIVE_SORT_MODES.map((mode) => (
              <option key={mode} value={mode}>
                {ACTIVE_SORT_LABELS[mode]}
              </option>
            ))}
          </select>
        </label>
      </SettingsGroup>

      <ProjectIconSettings />

      {/* @settings:project-colours (Q2) */}
      <ProjectColoursBlock
        projects={projects}
        organization={organization}
        settings={draft}
        onSettingsChange={setDraft}
      />
      {/* @settings:project-decor (Q4) */}
      <ProjectDecorBlock
        settings={draft}
        projects={decor.projects}
        projectNames={Object.fromEntries(
          projects.map((project) => [project.id, project.name]),
        )}
        onAutoProjectColoursChange={(autoProjectColours) =>
          setDraft((current) => ({ ...current, autoProjectColours }))
        }
      />
      {/* @settings:lifecycle (Q5) */}
      <LifecycleBlock settings={draft} onSettingsChange={setDraft} />

      <div className="flex items-center justify-end gap-3">
        {dirty ? (
          <span className="text-xs text-muted-foreground">Unsaved changes</span>
        ) : null}
        <button
          type="button"
          disabled={!dirty || saving}
          onClick={() => void save()}
          className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {saving ? "Saving..." : "Save changes"}
        </button>
      </div>
    </div>
  );
}
