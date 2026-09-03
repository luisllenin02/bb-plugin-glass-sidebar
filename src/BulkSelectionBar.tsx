import { Icon, type IconName } from "./components/Icon";

export function BulkSelectionBar({
  count,
  busy,
  lifecycleEnabled,
  onSettle,
  onSnooze,
  onMarkRead,
  onMarkUnread,
  onClear,
}: {
  count: number;
  busy: boolean;
  lifecycleEnabled: boolean;
  onSettle: () => void;
  onSnooze: (snoozedUntil: number) => void;
  onMarkRead: () => void;
  onMarkUnread: () => void;
  onClear: () => void;
}) {
  return (
    <div
      role="toolbar"
      aria-label={`${count} threads selected`}
      className="flex h-7 min-w-0 flex-1 items-center gap-0.5"
    >
      <span className="min-w-0 flex-1 truncate px-1 text-xs font-medium text-foreground">
        {count} selected
      </span>
      {/* @bulk:lifecycle (Q5) */}
      <ActionButton
        label="Settle selected threads"
        icon="Check"
        disabled={busy || !lifecycleEnabled}
        onClick={onSettle}
      />
      <ActionButton
        label="Snooze selected threads for one day"
        icon="Clock"
        disabled={busy || !lifecycleEnabled}
        onClick={() => onSnooze(Date.now() + 24 * 60 * 60_000)}
      />
      <ActionButton
        label="Mark selected threads read"
        icon="MailOpen"
        disabled={busy}
        onClick={onMarkRead}
      />
      <ActionButton
        label="Mark selected threads unread"
        icon="Mail"
        disabled={busy}
        onClick={onMarkUnread}
      />
      <ActionButton
        label="Clear selection"
        icon="CircleX"
        disabled={busy}
        onClick={onClear}
      />
    </div>
  );
}

function ActionButton({
  label,
  icon,
  disabled,
  onClick,
}: {
  label: string;
  icon: IconName;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      disabled={disabled}
      onClick={onClick}
      className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-sidebar-accent hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={icon} className="size-3.5" />
    </button>
  );
}
