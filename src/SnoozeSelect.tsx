import { useState } from "react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "./components/Select";
import { Icon } from "./components/Icon";
import { Tooltip } from "./components/Tooltip";
import type { ConfiguredSnoozePreset } from "./row-props";

export function SnoozeSelect({
  label,
  snoozePresets,
  disabled = false,
  triggerClassName,
  onOpenChange,
  onSnooze,
}: {
  label: string;
  snoozePresets: readonly ConfiguredSnoozePreset[];
  disabled?: boolean;
  triggerClassName: string;
  onOpenChange?: (open: boolean) => void;
  onSnooze: (snoozedUntil: number) => void;
}) {
  // Radix Select portals its children into a detached fragment while closed,
  // so every row otherwise carries one mounted item per preset. Rendering the
  // items only while open leaves a closed picker costing one trigger.
  const [open, setOpen] = useState(false);
  return (
    <Select
      open={open}
      disabled={disabled || snoozePresets.length === 0}
      onOpenChange={(next) => {
        setOpen(next);
        onOpenChange?.(next);
      }}
      onValueChange={(presetId) => {
        const preset = snoozePresets.find((item) => item.id === presetId);
        if (preset) onSnooze(Date.now() + preset.durationMs);
      }}
    >
      <Tooltip label={label}>
        <SelectTrigger
          aria-label={label}
          className={`${triggerClassName} [&>svg:last-child]:hidden`}
        >
          <Icon name="Clock" className="size-3.5" />
        </SelectTrigger>
      </Tooltip>
      <SelectContent align="end">
        {open
          ? snoozePresets.map((preset) => (
              <SelectItem
                key={preset.id}
                value={preset.id}
                className="text-xs"
              >
                {preset.label}
              </SelectItem>
            ))
          : null}
      </SelectContent>
    </Select>
  );
}
