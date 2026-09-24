// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { useState } from "react";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import {
  RovingFocusContext,
  createRovingStore,
  handleRovingKeyDown,
  useRowTabStop,
} from "./roving-focus";

afterEach(cleanup);

describe("createRovingStore", () => {
  it("falls back until a row is preferred, and again when it leaves", () => {
    const store = createRovingStore();
    const listener = vi.fn();
    store.subscribe(listener);
    store.sync(new Set(["a", "b", "c"]), "b");
    expect(store.isStop("b")).toBe(true);
    // A render-time sync is silent until the list flushes it.
    expect(listener).not.toHaveBeenCalled();
    store.flush();
    expect(listener).toHaveBeenCalledTimes(1);
    store.prefer("c");
    expect(store.isStop("c")).toBe(true);
    expect(store.isStop("b")).toBe(false);
    expect(listener).toHaveBeenCalledTimes(2);
    store.sync(new Set(["a", "b"]), "a");
    store.flush();
    expect(store.isStop("a")).toBe(true);
    expect(listener).toHaveBeenCalledTimes(3);
    // An unchanged stop notifies no one.
    store.sync(new Set(["a", "b"]), "a");
    store.flush();
    expect(listener).toHaveBeenCalledTimes(3);
  });
});

function Row({ id }: { id: string }) {
  const { isTabStop, onFocus } = useRowTabStop(id);
  return (
    <li data-glass-row="" onFocus={onFocus}>
      <a
        href="#"
        data-sidebar-thread-shortcut-target=""
        aria-label={id}
        tabIndex={isTabStop ? 0 : -1}
      />
      <button type="button" tabIndex={isTabStop ? undefined : -1}>
        {`${id} action`}
      </button>
    </li>
  );
}

function List({ ids }: { ids: string[] }) {
  const [store] = useState(() => {
    const created = createRovingStore();
    created.sync(new Set(ids), ids[0] ?? null);
    return created;
  });
  return (
    <RovingFocusContext.Provider value={store}>
      <ul onKeyDown={handleRovingKeyDown}>
        {ids.map((id) => (
          <Row key={id} id={id} />
        ))}
      </ul>
    </RovingFocusContext.Provider>
  );
}

const anchor = (id: string) => screen.getByRole("link", { name: id });

describe("roving tab stop", () => {
  it("leaves one row and its controls in the tab order", () => {
    render(<List ids={["a", "b", "c"]} />);
    expect(anchor("a").tabIndex).toBe(0);
    expect(anchor("b").tabIndex).toBe(-1);
    expect(screen.getByRole("button", { name: "a action" }).tabIndex).toBe(0);
    expect(screen.getByRole("button", { name: "c action" }).tabIndex).toBe(-1);
  });

  it("moves with Up/Down and Home/End, and the stop follows focus", () => {
    render(<List ids={["a", "b", "c"]} />);
    act(() => anchor("a").focus());
    fireEvent.keyDown(anchor("a"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(anchor("b"));
    expect(anchor("b").tabIndex).toBe(0);
    expect(anchor("a").tabIndex).toBe(-1);
    fireEvent.keyDown(anchor("b"), { key: "End" });
    expect(document.activeElement).toBe(anchor("c"));
    fireEvent.keyDown(anchor("c"), { key: "ArrowDown" });
    expect(document.activeElement).toBe(anchor("c"));
    fireEvent.keyDown(anchor("c"), { key: "Home" });
    expect(document.activeElement).toBe(anchor("a"));
    fireEvent.keyDown(anchor("a"), { key: "ArrowUp" });
    expect(document.activeElement).toBe(anchor("a"));
  });

  it("moves rows from a row's own control too", () => {
    render(<List ids={["a", "b"]} />);
    const action = screen.getByRole("button", { name: "a action" });
    act(() => action.focus());
    fireEvent.keyDown(action, { key: "ArrowDown" });
    expect(document.activeElement).toBe(anchor("b"));
  });

  it("leaves Alt+Arrow to the reorder handlers", () => {
    render(<List ids={["a", "b"]} />);
    act(() => anchor("a").focus());
    fireEvent.keyDown(anchor("a"), { key: "ArrowDown", altKey: true });
    expect(document.activeElement).toBe(anchor("a"));
  });

  it("opens the row menu from the context-menu key and Shift+F10", () => {
    render(<List ids={["a", "b"]} />);
    const onContextMenu = vi.fn();
    anchor("a").closest("li")!.addEventListener("contextmenu", onContextMenu);
    fireEvent.keyDown(anchor("a"), { key: "ContextMenu" });
    fireEvent.keyDown(anchor("a"), { key: "F10", shiftKey: true });
    expect(onContextMenu).toHaveBeenCalledTimes(2);
  });

  it("keeps every row tabbable outside a list", () => {
    render(
      <ul>
        <Row id="solo" />
      </ul>,
    );
    expect(anchor("solo").tabIndex).toBe(0);
  });
});
