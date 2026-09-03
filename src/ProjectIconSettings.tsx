import { useCallback, useEffect, useRef, useState } from "react";
import { useRealtime, useRpc } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import type { glassSidebarRpcContract } from "../server";
import {
  PROJECT_ICONS_CHANNEL,
  PROJECT_ICON_EXTENSIONS,
  projectIconUrl,
} from "./project-icons";

interface ProjectIconSetting {
  id: string;
  name: string;
  customPath: string | null;
  customUploadName: string | null;
}

const MAX_ICON_BYTES = 1_000_000;

function readFileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Could not read that image"));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");
      if (separator < 0) {
        reject(new Error("Could not read that image"));
        return;
      }
      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export function ProjectIconSettings() {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [projects, setProjects] = useState<ProjectIconSetting[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const [previewFailed, setPreviewFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await rpc.call("listProjectIconSettings", {});
      setProjects(result.projects);
      setSelectedProjectId((current) =>
        result.projects.some((project) => project.id === current)
          ? current
          : (result.projects[0]?.id ?? ""),
      );
    } catch (error) {
      toast.error("Could not load project icons", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setLoading(false);
    }
  }, [rpc]);

  useEffect(() => void load(), [load]);
  useRealtime(PROJECT_ICONS_CHANNEL, () => {
    setRevision((current) => current + 1);
    void load();
  });

  const selectedProject =
    projects.find((project) => project.id === selectedProjectId) ?? null;

  useEffect(() => setPreviewFailed(false), [revision, selectedProjectId]);

  const clearCustomIcon = async () => {
    if (!selectedProjectId || saving) return;
    setSaving(true);
    try {
      const result = await rpc.call("setProjectIcon", {
        projectId: selectedProjectId,
        path: null,
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProjectId ? { ...project, ...result } : project,
        ),
      );
      setRevision((current) => current + 1);
    } catch (error) {
      toast.error("Could not reset the project icon", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
    }
  };

  const upload = async (file: File) => {
    if (!selectedProjectId || saving) return;
    if (file.size > MAX_ICON_BYTES) {
      toast.error("Choose an image smaller than 1 MB");
      return;
    }
    const lowerName = file.name.toLowerCase();
    if (
      !PROJECT_ICON_EXTENSIONS.some((extension) =>
        lowerName.endsWith(extension),
      )
    ) {
      toast.error("Choose an SVG, PNG, ICO, JPEG, GIF, AVIF, or WebP image");
      return;
    }
    setSaving(true);
    try {
      const result = await rpc.call("uploadProjectIcon", {
        projectId: selectedProjectId,
        filename: file.name,
        mimeType: file.type,
        contentBase64: await readFileAsBase64(file),
      });
      setProjects((current) =>
        current.map((project) =>
          project.id === selectedProjectId ? { ...project, ...result } : project,
        ),
      );
      setRevision((current) => current + 1);
      setPreviewFailed(false);
    } catch (error) {
      toast.error("Could not save the project icon", {
        description: error instanceof Error ? error.message : undefined,
      });
    } finally {
      setSaving(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  if (loading) {
    return (
      <section aria-labelledby="settings-project-icons">
        <h2 id="settings-project-icons" className="text-sm font-semibold">
          Project icons
        </h2>
        <p className="mt-3 text-sm text-muted-foreground">Loading projects...</p>
      </section>
    );
  }

  return (
    <section aria-labelledby="settings-project-icons">
      <div className="mb-3">
        <h2 id="settings-project-icons" className="text-sm font-semibold">
          Project icons
        </h2>
        <p className="mt-1 text-xs leading-5 text-muted-foreground">
          Glass Sidebar finds common favicon files automatically. Upload an
          image only when you want to override it.
        </p>
      </div>
      {projects.length === 0 ? (
        <p className="rounded-lg border border-border px-4 py-8 text-center text-sm text-muted-foreground">
          No projects yet.
        </p>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border bg-card">
          <label className="grid gap-1.5 border-b border-border px-4 py-3 text-xs font-medium">
            Project
            <select
              value={selectedProjectId}
              onChange={(event) => setSelectedProjectId(event.target.value)}
              className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
            >
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
          <div className="flex items-center gap-3 border-b border-border px-4 py-4">
            <div className="flex size-12 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border bg-muted font-semibold text-muted-foreground">
              {selectedProject && !previewFailed ? (
                <img
                  src={projectIconUrl(selectedProject.id, revision)}
                  alt=""
                  className="size-full object-contain p-1.5"
                  onError={() => setPreviewFailed(true)}
                />
              ) : (
                selectedProject?.name.slice(0, 1).toUpperCase()
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">
                {selectedProject?.customUploadName ??
                  selectedProject?.customPath ??
                  "Automatic detection"}
              </p>
              <p className="text-xs text-muted-foreground">
                Maximum 1 MB; SVG, PNG, ICO, JPEG, GIF, AVIF, or WebP.
              </p>
            </div>
            {selectedProject?.customPath || selectedProject?.customUploadName ? (
              <button
                type="button"
                disabled={saving}
                onClick={() => void clearCustomIcon()}
                className="rounded-md border border-border px-3 py-2 text-xs"
              >
                Use automatic
              </button>
            ) : null}
          </div>
          <div className="flex items-center justify-end px-4 py-3">
            <input
              ref={fileInputRef}
              type="file"
              aria-label="Choose project icon image"
              accept={PROJECT_ICON_EXTENSIONS.join(",")}
              disabled={saving}
              className="sr-only"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void upload(file);
              }}
            />
            <button
              type="button"
              disabled={saving}
              onClick={() => fileInputRef.current?.click()}
              className="h-9 rounded-md bg-primary px-4 text-sm font-medium text-primary-foreground disabled:opacity-50"
            >
              {saving ? "Saving..." : "Choose image"}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
