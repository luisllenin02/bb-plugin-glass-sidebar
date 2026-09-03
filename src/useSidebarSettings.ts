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

export function useSidebarSettings(): SettingsAccess {
  const rpc = useRpc<typeof glassSidebarRpcContract>();
  const { status, threads } = useSidebarThreads();
  const [settings, setSettings] = useState<SettingsAccess>(
    () => cachedSidebarSettings(rpc) ?? DEFAULT_SIDEBAR_SETTINGS,
  );
  const mountedRevision = useRef<string | null>(null);
  const loaded = useRef(false);

  const load = useCallback(async () => {
    try {
      const result = await rpc.call("getSidebarSettings", {});
      loaded.current = true;
      setSettings(cacheSidebarSettings(rpc, result));
    } catch {
      // Keep the synchronous cache/defaults when the backend is still reloading.
    }
  }, [rpc]);

  const revision = `${status}:${threads
    .map((thread) => `${thread.id}:${thread.updatedAt}`)
    .join("\0")}`;
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
