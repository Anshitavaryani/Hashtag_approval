import { ChevronDown } from "lucide-react";

import { formatTime, isoTime } from "@/lib/format";
import type { HistoryEntry, Line } from "@/lib/types";
import { cn } from "@/lib/utils";

function describe(entry: HistoryEntry): string {
  const v = entry.version ? ` Version ${entry.version}` : "";
  switch (entry.type) {
    case "VERSION_SENT":
      return v ? `We sent${v}` : "We sent a new version";
    case "APPROVED":
      return entry.batch_id ? `You approved${v} (with Approve all)` : `You approved${v}`;
    case "APPROVAL_UNDONE":
      return v ? `You undid your approval of${v}` : "You undid an approval";
    case "NOTE_ADDED":
      return v ? `You sent a note about${v}` : "You sent a note";
    case "NOTE_REMOVED":
      return "You removed a note";
    case "NOTE_RESTORED":
      return "You restored a note";
    default: {
      const text = entry.type.toLowerCase().replace(/_/g, " ");
      return text.charAt(0).toUpperCase() + text.slice(1);
    }
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
