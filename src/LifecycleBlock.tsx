import {
  MAX_AUTO_SETTLE_AFTER_DAYS,
  MIN_AUTO_SETTLE_AFTER_DAYS,
  parseAutoSettleAfterDays,
} from "./auto-settle";
import {
  MAX_INACTIVE_AFTER_HOURS,
  MIN_INACTIVE_AFTER_HOURS,
  parseInactiveAfterHours,
} from "./inactive";
import { parseConfiguredSnoozePresets } from "./lifecycle";
import {
  DEFAULT_SIDEBAR_SETTINGS,
  type SettingsAccess,
} from "./row-props";

/**
 * The "Thread lifecycle" settings block. It is a standalone export so it
 * compiles and tests with or without Q6's settings hook; Q6 mounts it at the
 * `@settings:lifecycle (Q5)` anchor and supplies the live values.
 *
 * Every field is echoed back through the same parser the sidebar uses, so an
 * invalid entry says what it will actually do — turn the rule off — instead of
 * silently hiding threads on a number the user did not mean.
 */
export function LifecycleBlock({
  settings = DEFAULT_SIDEBAR_SETTINGS,
  onSettingsChange,
}: {
  settings?: SettingsAccess;
  onSettingsChange?: (values: SettingsAccess) => void;
}) {
  const disabled = !onSettingsChange;
  const update = (patch: Partial<SettingsAccess>) =>
    onSettingsChange?.({ ...settings, ...patch });
  const presets = parseConfiguredSnoozePresets(settings.snoozePresets);
  const inactiveAfterHours = parseInactiveAfterHours(
    settings.inactiveThreadsEnabled,
    String(settings.inactiveAfterHours),
  );
  const autoSettleAfterDays = parseAutoSettleAfterDays(
    settings.autoSettleInactive,
    String(settings.autoSettleAfterDays),
  );

  return (
    <section
      aria-label="Thread lifecycle"
      className="rounded-lg border border-border"
    >
      <header className="border-b border-border px-4 py-3">
        <h3 className="text-sm font-medium text-foreground">Thread lifecycle</h3>
        <p className="text-xs text-muted-foreground">
          When a quiet thread leaves the Active shelf, and how long a snooze
          hides it. A thread that is working or waiting on you never parks.
        </p>
      </header>

      <label className="grid gap-1.5 border-b border-border px-4 py-3 text-sm">
        <span className="text-foreground">Snooze presets</span>
        <input
          type="text"
          aria-label="Snooze presets"
          value={settings.snoozePresets}
          disabled={disabled}
          onChange={(event) => update({ snoozePresets: event.target.value })}
          className="h-9 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          Comma separated, `15m`, `2h`, `1d`, `1w`, optionally
          {" "}<code>Label=2h</code>. In use:{" "}
          {presets.map((preset) => preset.label).join(", ")}
        </span>
      </label>

      <label className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm">
        <span>
          <span className="block text-foreground">Inactive shelf</span>
          <span className="block text-xs text-muted-foreground">
            Move quiet threads to their own shelf below Active.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Inactive shelf"
          checked={settings.inactiveThreadsEnabled}
          disabled={disabled}
          onChange={(event) =>
            update({ inactiveThreadsEnabled: event.target.checked })
          }
        />
      </label>

      <label className="grid gap-1.5 border-b border-border px-4 py-3 text-sm">
        <span className="text-foreground">Inactive after (hours)</span>
        <input
          type="number"
          aria-label="Inactive after hours"
          min={MIN_INACTIVE_AFTER_HOURS}
          max={MAX_INACTIVE_AFTER_HOURS}
          step={1}
          value={settings.inactiveAfterHours}
          disabled={disabled || !settings.inactiveThreadsEnabled}
          onChange={(event) =>
            update({ inactiveAfterHours: Number(event.target.value) })
          }
          className="h-9 w-28 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {inactiveAfterHours === null
            ? "Off: every thread stays on Active."
            : `Whole hours, ${MIN_INACTIVE_AFTER_HOURS}–${MAX_INACTIVE_AFTER_HOURS}.`}
        </span>
      </label>

      <label className="flex items-center justify-between gap-3 border-b border-border px-4 py-3 text-sm">
        <span>
          <span className="block text-foreground">Settle inactive threads</span>
          <span className="block text-xs text-muted-foreground">
            File a long-quiet thread away automatically. Pinning it, or any new
            activity, brings it straight back.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Settle inactive threads"
          checked={settings.autoSettleInactive}
          disabled={disabled}
          onChange={(event) =>
            update({ autoSettleInactive: event.target.checked })
          }
        />
      </label>

      <label className="grid gap-1.5 border-b border-border px-4 py-3 text-sm">
        <span className="text-foreground">Settle after (days)</span>
        <input
          type="number"
          aria-label="Settle after days"
          min={MIN_AUTO_SETTLE_AFTER_DAYS}
          max={MAX_AUTO_SETTLE_AFTER_DAYS}
          step={1}
          value={settings.autoSettleAfterDays}
          disabled={disabled || !settings.autoSettleInactive}
          onChange={(event) =>
            update({ autoSettleAfterDays: Number(event.target.value) })
          }
          className="h-9 w-28 rounded-md border border-border bg-background px-2.5 text-sm"
        />
        <span className="text-xs text-muted-foreground">
          {autoSettleAfterDays === null
            ? "Off: nothing settles on inactivity alone."
            : `Whole days, ${MIN_AUTO_SETTLE_AFTER_DAYS}–${MAX_AUTO_SETTLE_AFTER_DAYS}.`}
        </span>
      </label>

      <label className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
        <span>
          <span className="block text-foreground">
            Settle when the pull request merges
          </span>
          <span className="block text-xs text-muted-foreground">
            A closed pull request always settles its threads; this adds merged
            ones. Open and draft pull requests never settle.
          </span>
        </span>
        <input
          type="checkbox"
          aria-label="Settle when the pull request merges"
          checked={settings.autoSettleOnMerge}
          disabled={disabled}
          onChange={(event) =>
            update({ autoSettleOnMerge: event.target.checked })
          }
        />
      </label>
    </section>
  );
}
