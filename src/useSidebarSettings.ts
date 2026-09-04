import { useCallback, useEffect, useRef, useState } from "react";
import {
  experimental_useSidebarThreads as useSidebarThreads,
  useRealtime,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import type { glassSidebarRpcContract } from "../server";
import type { SettingsAccess } from "./row-props";
import {
  cachedSidebarSettings,
  cacheSidebarSettings,
  DEFAULT_SIDEBAR_SETTINGS,
  SIDEBAR_SETTINGS_CHANNEL,
} from "./sidebar-settings";

/**
 * Every field of `SettingsAccess` is a primitive, so one key-by-key pass
 * settles it. Settings are re-read on the settings channel, on every
 * visibility flip and on the first host revision, and they almost never differ
 * between those reads; skipping the identical ones keeps one object identity
 * and, with it, one `JSON.stringify` into `localStorage` per real change.
 */
function sameSettings(left: SettingsAccess, right: SettingsAccess): boolean {
  if (left === right) return true;
  const keys = Object.keys(right) as (keyof SettingsAccess)[];
  return (
    keys.length === Object.keys(left).length &&
    keys.every((key) => left[key] === right[key])
  );
}

export function useSidebarSettings(): SettingsAccess {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const { status, threads } = useSidebarThreads();
  const [settings, setSettings] = useState<SettingsAccess>(
    () => cachedSidebarSettings(rpc) ?? DEFAULT_SIDEBAR_SETTINGS,
  );
  const mountedRevision = useRef<string | null>(null);
  const loaded = useRef(false);

  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const load = useCallback(async () => {
    try {
      const result = await rpc.call("getSidebarSettings", {});
      // The first answer is always written through, so the cross-mount caches
      // are populated even when the backend agrees with the defaults.
      const isFirstLoad = !loaded.current;
      loaded.current = true;
      if (!isFirstLoad && sameSettings(settingsRef.current, result)) return;
      const stable = cacheSidebarSettings(rpc, result);
      settingsRef.current = stable;
      setSettings(stable);
    } catch {
      // Keep the synchronous cache/defaults when the backend is still reloading.
    }
  }, [rpc]);

  let revision = status;
  for (const thread of threads) revision += `\0${thread.id}:${thread.updatedAt}`;
  useEffect(() => {
    if (mountedRevision.current === null) {
      mountedRevision.current = revision;
      return;
    }
    if (!loaded.current && mountedRevision.current !== revision) {
      mountedRevision.current = revision;
      void load();
    }
  }, [load, revision]);

  useEffect(() => {
    const requestIdle = window.requestIdleCallback;
    if (typeof requestIdle === "function") {
      const id = requestIdle(() => {
        if (!loaded.current) void load();
      });
      return () => window.cancelIdleCallback?.(id);
    }
    const id = window.setTimeout(() => {
      if (!loaded.current) void load();
    }, 0);
    return () => window.clearTimeout(id);
  }, [load]);

  useRealtime(SIDEBAR_SETTINGS_CHANNEL, () => void load());
  useEffect(() => {
    const refreshVisible = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", refreshVisible);
    return () =>
      document.removeEventListener("visibilitychange", refreshVisible);
  }, [load]);

  return settings;
}
