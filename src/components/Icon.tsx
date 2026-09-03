import { CircleIcon, Loading03Icon, MessageQuestionIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon, type IconSvgElement } from "@hugeicons/react";

const ICONS = {
  idle: CircleIcon,
  loading: Loading03Icon,
  question: MessageQuestionIcon,
} as const satisfies Record<string, IconSvgElement>;

export type IconName = keyof typeof ICONS;

export function Icon({
  name,
  className,
}: {
  name: IconName;
  className?: string;
}) {
  return <HugeiconsIcon icon={ICONS[name]} className={className} aria-hidden />;
}
