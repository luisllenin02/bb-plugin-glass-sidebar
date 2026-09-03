import { useRef, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  type PluginThreadHeaderActionProps,
} from "@get-bb/plugin-sdk/app";
import { IconPicker } from "./IconPicker";
import { ProjectGlyph } from "./ProjectGlyph";
import { useProjectDecor } from "./useProjectDecor";
import { useCompactThreadHeaderControl } from "./useCompactThreadHeaderControl";

export function ProjectChip({
  threadId,
  projectId,
  isCompactViewport,
}: PluginThreadHeaderActionProps) {
  const { projects } = useSidebarThreads();
  const decor = useProjectDecor();
  const [open, setOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const isCompactControl = useCompactThreadHeaderControl(
    buttonRef,
    isCompactViewport,
  );
  const projectName =
    projects.find((project) => project.id === projectId)?.name ?? "Project";
  const projectDecor = decor.decorFor(projectId);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        aria-label={`Project icon and colour for ${projectName}`}
        title={projectName}
        data-thread-id={threadId}
        onClick={() => setOpen(true)}
        className="inline-flex h-7 max-w-44 items-center gap-1.5 rounded-md border border-border/60 px-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
      >
        <ProjectGlyph
          decor={projectDecor}
          faviconUrl={null}
          className="size-3.5"
        />
        {isCompactControl ? null : (
          <span className="truncate">{projectName}</span>
        )}
      </button>
      <IconPicker
        open={open}
        onOpenChange={setOpen}
        projectId={projectId}
        projectName={projectName}
        decor={projectDecor}
      />
    </>
  );
}
