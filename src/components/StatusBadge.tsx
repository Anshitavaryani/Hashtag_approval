import { lineStatus, type Tone } from "@/lib/lines";
import type { Line } from "@/lib/types";
import { cn } from "@/lib/utils";

// The shop's status pill colours and dot (hashtag-next OrderCard.tsx toneStyles). The waiting
// dot is the dark yellow, because the shop's bright yellow dot barely shows on the pale pill.
const TONES: Record<Tone, { pill: string; dot: string }> = {
  waiting: { pill: "border-primary bg-primary-soft text-primary-ink", dot: "bg-primary-ink" },
  progress: { pill: "border-input bg-muted text-foreground", dot: "bg-secondary-ink" },
  success: { pill: "border-success/30 bg-success-soft text-success", dot: "bg-success" },
};

export function StatusBadge({
  line,
  readOnly,
  small = false,
  id,
  className,
}: {
  line: Line;
  readOnly: boolean;
  /** For the narrow tiles on phones. */
  small?: boolean;
  id?: string;
  className?: string;
}) {
  const { label, tone } = lineStatus(line, readOnly);
  return (
    <span
      id={id}
      className={cn(
        "inline-flex max-w-full shrink-0 items-center rounded-full border leading-none font-semibold",
        small ? "gap-1 px-2 py-1 text-[11px]" : "gap-1.5 px-2.5 py-1 text-xs",
        TONES[tone].pill,
        className,
      )}
    >
      <span className={cn("size-1.5 shrink-0 rounded-full", TONES[tone].dot)} aria-hidden />
      <span className="truncate">{label}</span>
    </span>
  );
}
