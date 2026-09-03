import { describe, expect, it } from "vitest";
import {
  ACCENT_NAMES,
  autoProjectColorCss,
  autoProjectPaletteIndex,
  projectIconColorCss,
} from "./accent";
import {
  SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR,
  autoProjectColor,
} from "./auto-assign";
import { resolveAccentSource } from "./accent-source";
import type { Organization } from "./organization";

const organization: Organization = {
  folders: [
    {
      id: "fld_1",
      name: "Folder",
      colorIndex: 2,
      customColor: null,
      collapsed: false,
      sortIndex: 0,
      threadIds: ["thr_folder"],
    },
  ],
  members: { thr_folder: "fld_1" },
  threadAccents: { thr_thread: { colorIndex: 4, customColor: null } },
  projectAccents: { proj_manual: { colorIndex: 6, customColor: null } },
};

describe("resolveAccentSource", () => {
  const decor = {
    proj_decor: {
      icon: "rocket",
      iconColor: "blue" as const,
      source: "auto" as const,
    },
    proj_manual: {
      icon: "rocket",
      iconColor: "red" as const,
      source: "auto" as const,
    },
  };

  it("keeps thread, folder and manual project precedence", () => {
    expect(resolveAccentSource("thr_thread", "proj_decor", organization, decor)).toMatchObject({ source: "thread" });
    expect(resolveAccentSource("thr_folder", "proj_decor", organization, decor)).toMatchObject({ source: "folder" });
    expect(resolveAccentSource("thr_other", "proj_manual", organization, decor)).toMatchObject({ source: "project" });
  });

  it("uses owned decor, then auto colour, then none", () => {
    expect(resolveAccentSource("thr_other", "proj_decor", organization, decor)).toEqual({
      css: projectIconColorCss("blue"),
      source: "project-decor",
    });
    expect(resolveAccentSource("thr_other", "proj_auto", organization, decor)).toEqual({
      css: autoProjectColorCss("proj_auto"),
      source: "auto",
    });
    expect(
      resolveAccentSource("thr_other", "proj_auto", organization, decor, {
        autoProjectColours: false,
      }),
    ).toEqual({ css: undefined, source: "none" });
  });
});

describe("automatic project colour parity", () => {
  it("pins the palette index to Project Decor colour-name map", () => {
    expect(
      ACCENT_NAMES.map((name, index) => [
        name,
        SIDEBAR_ACCENT_TO_PROJECT_ICON_COLOR[index],
      ]),
    ).toEqual([
      ["none", null],
      ["blue", "blue"],
      ["coral", "red"],
      ["amber", "yellow"],
      ["green", "green"],
      ["pink", "pink"],
      ["violet", "purple"],
      ["teal", "teal"],
      ["orange", "orange"],
    ]);
  });

  it("pins three project ids to the single accent hash definition", () => {
    expect(
      ["proj_alpha", "proj_beta", "proj_gamma"].map((projectId) => [
        projectId,
        autoProjectPaletteIndex(projectId),
        autoProjectColorCss(projectId),
        autoProjectColor(projectId),
      ]),
    ).toEqual([
      ["proj_alpha", 5, "hsl(330 70% 62%)", "pink"],
      ["proj_beta", 3, "hsl(45 90% 55%)", "yellow"],
      ["proj_gamma", 6, "hsl(280 55% 62%)", "purple"],
    ]);
  });
});
