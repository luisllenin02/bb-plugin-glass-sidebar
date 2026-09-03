// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk";
import { ACCENT_PALETTE } from "./accent";
import { Disc, hashHue } from "./Disc";

afterEach(cleanup);

describe("Disc", () => {
  it("uses the contracted accent palette through a custom property", () => {
    const thread = { id: "thr_palette" } as PluginSidebarThread;
    const { container } = render(<Disc thread={thread} />);
    const disc = container.firstElementChild as HTMLElement;
    const expected =
      ACCENT_PALETTE[
        1 + (hashHue(thread.id) % (ACCENT_PALETTE.length - 1))
      ];

    expect(disc.style.getPropertyValue("--disc-color")).toBe(expected);
    expect(disc.style.backgroundColor).toBe("");
    expect(disc.className).toContain("bg-[var(--disc-color)]");
    expect(container.innerHTML).not.toMatch(/oklch|#[0-9a-f]{3,8}/i);
  });

  it("uses the host muted token for a cluster remainder", () => {
    const { container } = render(<Disc thread={null} />);
    const disc = container.firstElementChild as HTMLElement;

    expect(disc.style.getPropertyValue("--disc-color")).toBe(
      "var(--muted-foreground)",
    );
  });
});
