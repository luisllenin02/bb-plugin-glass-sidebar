import { describe, expect, it } from "vitest";
import type { Folder } from "./organization";
import { decideThreadDrop } from "./useFolderDrag";

const folder: Folder = {
  id: "folder",
  name: "Folder",
  colorIndex: 0,
  customColor: null,
  collapsed: false,
  sortIndex: 0,
  threadIds: ["a", "b", "c"],
};

describe("decideThreadDrop", () => {
  it("reorders inside a folder without using the moving row as its anchor", () => {
    expect(
      decideThreadDrop({
        draggingId: "c",
        sourceFolderId: "folder",
        folders: [folder],
        target: {
          kind: "thread",
          threadId: "a",
          folderId: "folder",
          placement: "before",
        },
      }),
    ).toEqual({
      kind: "reorder-folder",
      folderId: "folder",
      threadIds: ["c", "a", "b"],
    });
    expect(
      decideThreadDrop({
        draggingId: "b",
        sourceFolderId: "folder",
        folders: [folder],
        target: {
          kind: "thread",
          threadId: "a",
          folderId: "folder",
          placement: "after",
        },
      }),
    ).toBeNull();
  });

  it("moves a cross-folder row at the requested member position", () => {
    expect(
      decideThreadDrop({
        draggingId: "loose",
        sourceFolderId: null,
        folders: [folder],
        target: {
          kind: "thread",
          threadId: "b",
          folderId: "folder",
          placement: "after",
        },
      }),
    ).toEqual({
      kind: "move",
      threadId: "loose",
      folderId: "folder",
      beforeThreadId: "c",
    });
  });

  it("creates a folder only on the centre of another ungrouped card", () => {
    expect(
      decideThreadDrop({
        draggingId: "dragged",
        sourceFolderId: null,
        folders: [folder],
        target: {
          kind: "thread",
          threadId: "target",
          folderId: null,
          placement: "on",
        },
      }),
    ).toEqual({ kind: "create-folder", threadIds: ["target", "dragged"] });
    expect(
      decideThreadDrop({
        draggingId: "dragged",
        sourceFolderId: null,
        folders: [folder],
        target: {
          kind: "thread",
          threadId: "target",
          folderId: null,
          placement: "before",
        },
      }),
    ).toBeNull();
  });
});

// @vitest-environment jsdom
describe("touch gating in useFolderDrag", async () => {
  const { renderHook, act } = await import("@testing-library/react");
  const { vi } = await import("vitest");
  const { useFolderDrag } = await import("./useFolderDrag");
  const { TOUCH_HOLD_MS } = await import("./drag-gesture");

  const actions = {
    moveThreadToFolder: vi.fn(async () => ({ ok: true as const })),
    reorderFolderThreads: vi.fn(async () => ({ ok: true as const })),
    reorderFolders: vi.fn(async () => ({ ok: true as const })),
    createFolder: vi.fn(async () => ({ folder: { ...folder, id: "new" } })),
  } as unknown as Parameters<typeof useFolderDrag>[0]["actions"];

  // jsdom has no hit testing; the gate under test runs before any hit test.
  Object.defineProperty(document, "elementFromPoint", {
    configurable: true,
    value: () => null,
  });

  function pointer(type: string, clientX: number, clientY: number) {
    const event = new MouseEvent(type, { clientX, clientY, bubbles: true });
    Object.defineProperty(event, "pointerId", { value: 7 });
    return event;
  }

  function pressWith(pointerType: string) {
    const rendered = renderHook(() =>
      useFolderDrag({ folders: [folder], folderOf: () => null, actions }),
    );
    act(() => {
      rendered.result.current.threadControls("a").onPointerDown({
        button: 0,
        pointerId: 7,
        clientX: 10,
        clientY: 10,
        pointerType,
      } as never);
    });
    return rendered;
  }

  it("does not start a drag when a finger scrolls the list", () => {
    vi.useFakeTimers();
    const rendered = pressWith("touch");
    act(() => {
      window.dispatchEvent(pointer("pointermove", 10, 60));
    });
    expect(rendered.result.current.draggingId).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS + 50);
    });
    // The scroll aborted the gesture, so the hold timer must not revive it.
    expect(rendered.result.current.draggingId).toBeNull();
    act(() => {
      window.dispatchEvent(pointer("pointerup", 10, 200));
    });
    expect(actions.createFolder).not.toHaveBeenCalled();
    expect(actions.moveThreadToFolder).not.toHaveBeenCalled();
    vi.useRealTimers();
  });

  it("starts a touch drag only after the finger holds still", () => {
    vi.useFakeTimers();
    const rendered = pressWith("touch");
    act(() => {
      window.dispatchEvent(pointer("pointermove", 12, 13));
    });
    expect(rendered.result.current.draggingId).toBeNull();
    act(() => {
      vi.advanceTimersByTime(TOUCH_HOLD_MS);
    });
    expect(rendered.result.current.draggingId).toBe("a");
    const scroll = new Event("touchmove", { cancelable: true });
    window.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(true);
    act(() => {
      window.dispatchEvent(pointer("pointerup", 12, 13));
    });
    expect(rendered.result.current.draggingId).toBeNull();
    vi.useRealTimers();
  });

  it("still engages a mouse after a short travel", () => {
    const rendered = pressWith("mouse");
    act(() => {
      window.dispatchEvent(pointer("pointermove", 10, 18));
    });
    expect(rendered.result.current.draggingId).toBe("a");
    act(() => {
      window.dispatchEvent(pointer("pointerup", 10, 18));
    });
    expect(rendered.result.current.draggingId).toBeNull();
  });
});
