// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { cleanup, screen, waitFor } from "@testing-library/react";
import { loadPluginApp, renderSlot } from "@get-bb/plugin-sdk/testing/app";

await loadPluginApp(() => import("../app"));
const { useProjectDecor, resetProjectDecorCacheForTests } = await import(
  "./useProjectDecor"
);

const glyph = [["path", { d: "M4 4h16v16H4z" }]] as const;

function Probe() {
  const first = useProjectDecor();
  const second = useProjectDecor();
  return (
    <output>
      {first.status}:{first.decorFor("proj_1")?.icon ?? "none"}:
      {second.decorFor("proj_1")?.glyph?.length ?? 0}
    </output>
  );
}

afterEach(() => {
  cleanup();
  resetProjectDecorCacheForTests();
  vi.restoreAllMocks();
});

it("deduplicates mounts and refreshes only on decor signals or visibility", async () => {
  let revision = 0;
  const rendered = renderSlot(
    { component: Probe },
    {},
    {
      rpc: {
        getProjectDecor: () => {
          revision += 1;
          return {
            projects: {
              proj_1: {
                icon: revision === 1 ? "rocket" : "code",
                iconColor: "blue" as const,
                source: "auto" as const,
                autoReason: "name:dev",
                autoKeywords: [],
              },
            },
            updatedAt: revision,
          };
        },
        getProjectGlyphs: () => ({ glyphs: { rocket: glyph, code: glyph } }),
      },
    },
  );

  await screen.findByText("ready:rocket:1");
  expect(
    rendered.rpcCalls.filter((call) => call.method === "getProjectDecor"),
  ).toHaveLength(1);
  expect(
    rendered.rpcCalls.filter((call) => call.method === "getProjectGlyphs"),
  ).toHaveLength(1);

  await rendered.emitRealtime("project-decor", { reason: "test" });
  await screen.findByText("ready:code:1");
  await waitFor(() =>
    expect(
      rendered.rpcCalls.filter((call) => call.method === "getProjectDecor"),
    ).toHaveLength(2),
  );

  Object.defineProperty(document, "visibilityState", {
    configurable: true,
    value: "visible",
  });
  document.dispatchEvent(new Event("visibilitychange"));
  await waitFor(() =>
    expect(
      rendered.rpcCalls.filter((call) => call.method === "getProjectDecor"),
    ).toHaveLength(3),
  );
});
