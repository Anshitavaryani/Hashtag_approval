import { ChevronDown } from "lucide-react";

import { formatTime, isoTime } from "@/lib/format";
import type { HistoryEntry, Line } from "@/lib/types";
import { cn } from "@/lib/utils";

// One sentence per entry (CHANGES-24NOV 5.3). Every choice names its version; the wording without
// one is only for an odd entry.
function describe(entry: HistoryEntry): string {
  const v = entry.version ? `Version ${entry.version}` : "";
  switch (entry.kind) {
    case "SENT":
      return v ? `We sent ${v}` : "We sent a new version";
    case "APPROVED":
      return `${v ? `You approved ${v}` : "You approved an artwork preview"}${entry.batch_id ? " (with Approve all)" : ""}`;
    case "WENT_BACK":
      return v ? `You went back to ${v}` : "You went back to an earlier version";
    case "REJECTED":
      return v ? `You rejected ${v}` : "You rejected an artwork preview";
    case "UNDID_APPROVAL":
      return v ? `You undid your approval of ${v}` : "You undid an approval";
    case "UNDID_GO_BACK":
      return v ? `You undid going back to ${v}` : "You undid going back";
    case "UNDID_REJECTION":
      return v ? `You undid your rejection of ${v}` : "You undid a rejection";
  }
}

/** Everything that happened on one item, newest first, folded away until asked for. */
export function LineHistory({ line }: { line: Line }) {
  if (line.history.length === 0) return null;
  return (
    <details className="group rounded-xl border border-border/70 bg-card">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-2 rounded-xl px-4 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-details-marker]:hidden">
        <span>
          History <span className="font-normal text-muted-foreground">({line.history.length})</span>
        </span>
        <ChevronDown className="size-4 transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      <ol className="space-y-2.5 border-t border-border/70 px-4 py-3">
        {line.history.map((entry) => (
          <li key={entry.event_id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 text-sm">
            <span className={cn(entry.undone && "text-muted-foreground line-through")}>{describe(entry)}</span>
            {entry.undone ? (
              <span className="rounded-full bg-muted px-2 py-0.5 text-xs font-semibold text-foreground">Undone</span>
            ) : null}
            <time dateTime={isoTime(entry.created_at)} className="ml-auto text-xs text-muted-foreground">
              {formatTime(entry.created_at)}
            </time>
          </li>
        ))}
      </ol>
    </details>
  );
}
