// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import type {
  PluginSidebarPullRequest,
  PluginSidebarThreadIndicator,
} from "@get-bb/plugin-sdk";
import { StatusGlyph } from "./StatusGlyph";
import {
  pullRequestToneClass,
  statusToneClass,
  WOKE_TONE_CLASS,
} from "./status-tone";

afterEach(cleanup);

describe("semantic status tones", () => {
  it.each([
    ["unread-error", "text-destructive"],
    ["waiting-for-input", "text-attention"],
    ["unread-success", "text-success"],
    ["runtime", "text-primary"],
    ["draft", "text-warning"],
  ] as const)("renders %s with %s", (indicator, expectedClass) => {
    render(<StatusGlyph indicator={indicator} label={indicator} />);

    const glyph = screen.getByLabelText(indicator);
    expect(glyph.getAttribute("class")).toContain(expectedClass);
    expect(statusToneClass(indicator)).toBe(expectedClass);
    expect(statusToneClass(indicator)).not.toMatch(
      /(?:red|indigo|emerald|sky|amber|violet)-\d/,
    );
  });

  it("uses the warning token for Woke", () => {
    expect(WOKE_TONE_CLASS).toBe("text-warning");
  });
});

describe("semantic pull-request tones", () => {
  const pullRequest = (
    state: PluginSidebarPullRequest["state"],
    attention: PluginSidebarPullRequest["attention"],
  ) => ({ state, attention }) as PluginSidebarPullRequest;

  it.each([
    [pullRequest("merged", "merged"), "text-pr-merged"],
    [pullRequest("open", "blocked"), "text-destructive"],
    [pullRequest("closed", "closed"), "text-destructive"],
    [pullRequest("open", "ready_to_merge"), "text-success"],
    [pullRequest("draft", "draft"), "text-muted-foreground/60"],
  ] as const)("maps a PR state to %s", (pullRequestValue, expectedClass) => {
    expect(pullRequestToneClass(pullRequestValue)).toBe(expectedClass);
  });
});
