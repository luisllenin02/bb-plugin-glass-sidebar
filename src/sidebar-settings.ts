import {
  DEFAULT_SIDEBAR_SETTINGS,
  type SidebarSettingsValues,
} from "./row-props";

export { DEFAULT_SIDEBAR_SETTINGS, type SidebarSettingsValues };

export const SIDEBAR_SETTINGS_CHANNEL = "sidebar-settings";
export const SIDEBAR_SETTINGS_CACHE_KEY =
  "glass-sidebar:settings-cache:v1";

const settingsByRpcClient = new WeakMap<object, SidebarSettingsValues>();

function readStoredSidebarSettings(): SidebarSettingsValues | null {
  try {
    const stored = window.localStorage.getItem(SIDEBAR_SETTINGS_CACHE_KEY);
    if (!stored) return null;
    const value = JSON.parse(stored) as Partial<SidebarSettingsValues>;
    if (
      typeof value.snoozePresets !== "string" ||
      typeof value.inactiveThreadsEnabled !== "boolean" ||
      typeof value.inactiveAfterHours !== "number" ||
      typeof value.autoSettleInactive !== "boolean" ||
      typeof value.autoSettleAfterDays !== "number" ||
      typeof value.autoSettleOnMerge !== "boolean" ||
      typeof value.autoProjectColours !== "boolean"
    ) {
      return null;
    }
    return { ...DEFAULT_SIDEBAR_SETTINGS, ...value };
  } catch {
    return null;
  }
}

export function cachedSidebarSettings(
  rpcClient: object,
): SidebarSettingsValues | null {
  const cached = settingsByRpcClient.get(rpcClient);
  if (cached) return cached;
  const stored = readStoredSidebarSettings();
  if (stored) settingsByRpcClient.set(rpcClient, stored);
  return stored;
}

export function cacheSidebarSettings(
  rpcClient: object,
  values: SidebarSettingsValues,
): SidebarSettingsValues {
  const stable = { ...values };
  settingsByRpcClient.set(rpcClient, stable);
  try {
    window.localStorage.setItem(
      SIDEBAR_SETTINGS_CACHE_KEY,
      JSON.stringify(stable),
    );
  } catch {
    // The in-memory cache still prevents first-paint flicker when storage is blocked.
  }
  return stable;
}
