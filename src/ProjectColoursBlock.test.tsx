// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { ProjectColoursBlock } from "./ProjectColoursBlock";
import { ACCENT_PALETTE } from "./accent";
import {
  DEFAULT_SIDEBAR_SETTINGS,
  EMPTY_ORGANIZATION_ACCESS,
  type OrganizationAccess,
} from "./row-props";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const projects = [{ id: "proj_1", name: "Sidebar" }];

function organizationAccess(
  overrides: Partial<OrganizationAccess> = {},
  actions: Partial<OrganizationAccess["actions"]> = {},
): OrganizationAccess {
  return {
    ...EMPTY_ORGANIZATION_ACCESS,
    ...overrides,
    actions: { ...EMPTY_ORGANIZATION_ACCESS.actions, ...actions },
  };
}

afterEach(cleanup);

describe("ProjectColoursBlock", () => {
  it("renders without Q6's settings hook, using the shared defaults", () => {
    render(
      <ProjectColoursBlock
        projects={projects}
        organization={organizationAccess()}
      />,
    );
    const block = screen.getByRole("region", { name: "Project colours" });
    expect(within(block).getByText("Sidebar")).toBeDefined();
    const toggle = within(block).getByLabelText<HTMLInputElement>(
      "Automatic project colours",
    );
    expect(toggle.checked).toBe(DEFAULT_SIDEBAR_SETTINGS.autoProjectColours);
    // Without an owner for the settings write, the switch is inert, not lying.
    expect(toggle.disabled).toBe(true);
    expect(within(block).getByText("None")).toBeDefined();
  });

  it("writes a manual project accent and clears it again", async () => {
    const setProjectAccent = vi.fn(async () => ({ ok: true as const }));
    render(
      <ProjectColoursBlock
        projects={projects}
        organization={organizationAccess(
          {
            projectAccentFor: () => ({
              css: ACCENT_PALETTE[4],
              source: "project",
            }),
            manualProjectAccentFor: () => ({
              colorIndex: 4,
              customColor: null,
            }),
          },
          { setProjectAccent },
        )}
      />,
    );
    const block = screen.getByRole("region", { name: "Project colours" });
    expect(within(block).getByText("Manual")).toBeDefined();

    fireEvent.click(within(block).getByRole("button", { name: "pink colour" }));
    await waitFor(() =>
      expect(setProjectAccent).toHaveBeenCalledWith({
        projectId: "proj_1",
        colorIndex: 5,
        customColor: null,
      }),
    );

    fireEvent.click(
      within(block).getByRole("button", { name: "Clear manual override" }),
    );
    await waitFor(() =>
      expect(setProjectAccent).toHaveBeenCalledWith({
        projectId: "proj_1",
        colorIndex: 0,
        customColor: null,
      }),
    );
  });

  it("hands the automatic-colour switch to its settings owner", () => {
    const onSettingsChange = vi.fn();
    render(
      <ProjectColoursBlock
        projects={[]}
        organization={organizationAccess()}
        settings={{ ...DEFAULT_SIDEBAR_SETTINGS, autoProjectColours: false }}
        onSettingsChange={onSettingsChange}
      />,
    );
    const block = screen.getByRole("region", { name: "Project colours" });
    expect(within(block).getByText("No projects available.")).toBeDefined();
    fireEvent.click(
      within(block).getByLabelText("Automatic project colours"),
    );
    expect(onSettingsChange).toHaveBeenCalledWith({
      ...DEFAULT_SIDEBAR_SETTINGS,
      autoProjectColours: true,
    });
  });
});
