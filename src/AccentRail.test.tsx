// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render } from "@testing-library/react";
import { AccentRail } from "./AccentRail";

afterEach(cleanup);

function rail(container: HTMLElement): HTMLElement | null {
  return container.querySelector("[data-accent-rail]");
}

describe("AccentRail", () => {
  it("paints the thread accent, falling back to the primary token", () => {
    const { container } = render(<AccentRail state="focused" />);
    const bar = rail(container)!;
    expect(bar.style.background).toBe("var(--thread-accent, var(--primary))");
    expect(bar.style.opacity).toBe("1");
    expect(bar.getAttribute("aria-hidden")).toBe("true");
  });

  it("fades for a thread open in an unfocused pane", () => {
    const { container } = render(<AccentRail state="open" />);
    expect(rail(container)!.style.opacity).toBe("0.55");
  });

  it("draws on an idle row only when the thread has a colour", () => {
    const { container: without } = render(<AccentRail state="none" />);
    expect(rail(without)).toBeNull();

    const { container: withAccent } = render(
      <AccentRail state="none" hasAccent />,
    );
    expect(rail(withAccent)!.style.opacity).toBe("0.4");
  });
});
