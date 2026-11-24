import type { ReactNode } from "react";
import { Check, ChevronRight, X } from "lucide-react";

import { versionName } from "@/lib/lines";
import type { Line, Version, VersionStatus } from "@/lib/types";
import { cn } from "@/lib/utils";

// How each row's status is read out: "Show Version 2, new, waiting for you".
const SPOKEN: Record<VersionStatus, string> = {
  WAITING: "new, waiting for you",
  APPROVED: "approved",
  REJECTED: "rejected",
  REPLACED: "replaced",
};

/**
 * The item's versions, newest first, each with where it stands; tapping one shows its pictures.
 * Only for an item with two or more versions that needs a preview. The ✓ and ✕ marks are only
 * decoration: the words say the same.
 */
export function VersionList({
  line,
  readOnly,
  shown,
  onSelect,
}: {
  line: Line;
  readOnly: boolean;
  /** The version on screen. */
  shown: number;
  onSelect: (version: number) => void;
}) {
  if (line.versions.length < 2 || line.status === "NO_PROOF_NEEDED") return null;
  const headingId = `versions-${line.id}`;
  return (
    <section aria-labelledby={headingId} className="space-y-2">
      <h3 id={headingId} className="text-sm font-semibold">
        Versions
      </h3>
      <ul className="divide-y divide-border/70 overflow-hidden rounded-xl border border-border/70">
        {[...line.versions].reverse().map((version) => {
          const current = version.version === shown;
          const spoken = version.status === "WAITING" && readOnly ? "not approved" : SPOKEN[version.status];
          const why = reason(version);
          const whyId = `${headingId}-${version.version}-why`;
          return (
            <li key={version.version}>
              <button
                type="button"
                onClick={() => onSelect(version.version)}
                aria-current={current ? "true" : undefined}
                aria-label={`Show ${versionName(version.version)}, ${spoken}`}
                aria-describedby={why ? whyId : undefined}
                className={cn(
                  "flex min-h-11 w-full items-start gap-2 py-2.5 pr-3 pl-2 text-left transition-colors focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset",
                  current ? "bg-primary-soft" : "hover:bg-muted/60",
                )}
              >
                {/* Marks the row on screen; the other rows keep the space so the names line up. */}
                <ChevronRight className={cn("mt-px size-4 shrink-0", !current && "invisible")} aria-hidden />
                <span className="flex min-w-0 flex-1 flex-col gap-1">
                  <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
                    <span className="text-sm font-semibold">{versionName(version.version)}</span>
                    <StatusTag status={version.status} readOnly={readOnly} />
                  </span>
                  {why ? (
                    <span id={whyId} className="block min-w-0 text-xs whitespace-nowrap text-muted-foreground">
                      {why}
                    </span>
                  ) : null}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** Under a rejected version: the start of the customer's note, or that going back rejected it. */
function reason(version: Version): ReactNode {
  if (version.status !== "REJECTED") return null;
  const note = version.note;
  if (note) {
    const count = note.pictures.length;
    const pictures = count ? ` · ${count} ${count === 1 ? "picture" : "pictures"}` : "";
    const words = note.body?.replace(/\s+/g, " ").trim();
    if (!words) return `Pictures only${pictures}`;
    // One line: the note is cut short with an ellipsis, leaving room for the closing quote and the
    // picture count. Inline, so the words read as one sentence (no gap before the quote).
    return (
      <>
        <span className={cn("inline-block truncate align-bottom", count ? "max-w-[calc(100%-6.5em)]" : "max-w-[calc(100%-1em)]")}>
          “{words}
        </span>
        ”{pictures}
      </>
    );
  }
  return version.went_back_to !== null ? `You went back to ${versionName(version.went_back_to)}` : null;
}

function StatusTag({ status, readOnly }: { status: VersionStatus; readOnly: boolean }) {
  const pill = "inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-0.5 text-xs leading-tight font-semibold";
  switch (status) {
    case "WAITING":
      return readOnly ? (
        <span className={cn(pill, "border-input bg-muted text-foreground")}>Not approved</span>
      ) : (
        <span className={cn(pill, "border-primary bg-primary-soft text-primary-ink")}>
          <span className="size-1.5 shrink-0 rounded-full bg-primary-ink" aria-hidden />
          New · waiting for you
        </span>
      );
    case "APPROVED":
      return (
        <span className={cn(pill, "border-success/30 bg-success-soft text-success")}>
          <Check className="size-3.5" strokeWidth={3} aria-hidden />
          Approved
        </span>
      );
    case "REJECTED":
      return (
        <span className={cn(pill, "border-input bg-muted text-foreground")}>
          <X className="size-3.5" strokeWidth={3} aria-hidden />
          Rejected
        </span>
      );
    case "REPLACED":
      return <span className="text-xs font-medium text-muted-foreground">Replaced</span>;
  }
}
