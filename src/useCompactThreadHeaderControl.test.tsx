// @vitest-environment jsdom
import { useRef } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useCompactThreadHeaderControl } from "./useCompactThreadHeaderControl";

let paneWidth = 640;
let observer: TestResizeObserver | null = null;

class TestResizeObserver {
  constructor(
    readonly callback: ResizeObserverCallback,
  ) {
    observer = this;
  }

  disconnect() {}

  observe() {}

  resize(width: number) {
    this.callback(
      [{ contentRect: { width } } as ResizeObserverEntry],
      this as unknown as ResizeObserver,
    );
  }
}

vi.stubGlobal("ResizeObserver", TestResizeObserver);
vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockImplementation(
  function (this: HTMLElement) {
    return { width: this.hasAttribute("data-split-pane-id") ? paneWidth : 0 } as DOMRect;
  },
);

function Probe({ isCompactViewport = false }: { isCompactViewport?: boolean }) {
  const ref = useRef<HTMLButtonElement>(null);
  const compact = useCompactThreadHeaderControl(ref, isCompactViewport);
  return <button ref={ref}>{compact ? "compact" : "full"}</button>;
}

afterEach(() => {
  document.body.innerHTML = "";
  paneWidth = 640;
  observer = null;
});

describe("useCompactThreadHeaderControl", () => {
  it("uses the split pane width instead of the browser width", async () => {
    render(
      <div data-split-pane-id="pane-1">
        <Probe />
      </div>,
    );

    expect(screen.getByRole("button").textContent).toBe("full");

    paneWidth = 480;
    observer?.resize(paneWidth);

    await waitFor(() => {
      expect(screen.getByRole("button").textContent).toBe("compact");
    });
  });

  it("always follows the host compact viewport mode", () => {
    render(<Probe isCompactViewport />);
    expect(screen.getByRole("button").textContent).toBe("compact");
  });
});
