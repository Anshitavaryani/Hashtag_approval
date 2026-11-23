"use client";

import { useId, type ReactNode } from "react";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { lineTitle } from "@/lib/lines";
import { allSentApproved, isSent, linesToApprove, type Line, type PublicView } from "@/lib/types";
import { cn } from "@/lib/utils";

/** How many items are approved, as a bar. The words next to it say the same for screen readers. */
export function ProgressBar({ view, className }: { view: PublicView; className?: string }) {
  const { approved_count: approved, total_count: total } = view.state;
  const percent = total > 0 ? Math.min(100, Math.round((approved / total) * 100)) : 0;
  return (
    <div aria-hidden className={cn("h-2 overflow-hidden rounded-full bg-foreground/10", className)}>
      <div className="h-full rounded-full bg-success transition-[width] duration-500" style={{ width: `${percent}%` }} />
    </div>
  );
}

/**
 * The Approve all box. Ticking it opens the confirm sheet; unticking undoes the last Approve all
 * while it can be undone. Offered once two or more items have an artwork preview.
 */
export function ApproveAllToggle({
  view,
  busy,
  showUndoHint,
  onTick,
  onUntick,
  compact = false,
  className,
}: {
  view: PublicView;
  busy: string | null;
  showUndoHint: boolean;
  onTick: () => void;
  onUntick: () => void;
  /** The slim bar: no second line. */
  compact?: boolean;
  className?: string;
}) {
  const hintId = useId();
  const checked = allSentApproved(view);
  const waiting = linesToApprove(view).length;
  const nothingToApprove = !checked && waiting === 0;
  const disabled = view.state.read_only || nothingToApprove;
  const working = busy === "approve-all" || busy === "undo-all";
  const undoable = !!view.last_batch?.undoable;
  const hint = checked && !undoable && !view.state.read_only && showUndoHint;
  const detail = checked
    ? undoable && !view.state.read_only
      ? "Untick to undo"
      : "Every item is approved"
    : nothingToApprove
      ? "Nothing to approve yet"
      : `Approves the ${waiting === 1 ? "item" : `${waiting} items`} still open`;

  return (
    <div className={className}>
      <label
        className={cn(
          "flex min-h-11 cursor-pointer items-center gap-3 rounded-xl border px-3.5 transition-colors has-focus-visible:ring-2 has-focus-visible:ring-ring has-focus-visible:ring-offset-2",
          compact ? "py-1.5" : "py-2.5",
          checked ? "border-success/40 bg-success-soft text-success" : "border-foreground bg-card hover:bg-primary-soft",
          disabled && "cursor-not-allowed opacity-60 hover:bg-card",
        )}
      >
        <input
          type="checkbox"
          className="size-5 shrink-0 accent-primary-ink"
          checked={checked}
          disabled={disabled}
          // Ticked but not undoable as a whole: still focusable, so the reason can be read out.
          // While another action runs it stays focusable too; the page ignores the click.
          aria-disabled={(checked && !undoable) || busy !== null ? true : undefined}
          aria-describedby={hint ? hintId : undefined}
          onChange={() => {
            if (busy !== null) return;
            if (checked) onUntick();
            else onTick();
          }}
        />
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="text-sm font-semibold">Approve all</span>
          {compact ? null : <span className="text-xs font-normal opacity-80">{detail}</span>}
        </span>
        {working ? <Loader2 className="size-4 shrink-0 animate-spin" aria-label="Working" /> : null}
      </label>
      {hint ? (
        <p id={hintId} role="status" className="mt-2 text-xs text-muted-foreground">
          Undo items one by one: open each item and choose Undo.
        </p>
      ) : null}
    </div>
  );
}

/**
 * A slim bar that slides in at the top once the summary has scrolled away: the order, the
 * progress and Approve all stay in reach. Hidden, it is inert, so it can't be tabbed to.
 */
export function StickyBar({
  view,
  visible,
  approveAll,
}: {
  view: PublicView;
  visible: boolean;
  /** The Approve all box, when the order offers it. */
  approveAll: ReactNode;
}) {
  return (
    <div
      aria-hidden={!visible}
      inert={!visible}
      className={cn(
        "fixed inset-x-0 top-0 z-40 border-b border-border/70 bg-card/95 shadow-sm backdrop-blur transition-transform duration-200",
        visible ? "translate-y-0" : "-translate-y-full",
      )}
    >
      <div className="mx-auto flex min-h-14 w-full max-w-[1200px] items-center gap-3 px-4 py-1.5 sm:px-6">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">Order {view.order.number}</p>
          <div className="mt-1 flex items-center gap-2">
            <ProgressBar view={view} className="h-1.5 w-20 shrink-0 sm:w-32" />
            <span className="truncate text-xs text-muted-foreground tabular-nums">
              {view.state.approved_count} of {view.state.total_count} approved
            </span>
          </div>
        </div>
        {approveAll}
      </div>
    </div>
  );
}

/** "Approve all 3 items?": each item it will approve and the version, plus what it leaves alone. */
export function ApproveAllSheet({
  view,
  open,
  busy,
  onOpenChange,
  onConfirm,
}: {
  view: PublicView;
  open: boolean;
  busy: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (lines: Line[]) => void;
}) {
  const lines = linesToApprove(view);
  const approved = view.lines.filter((line) => line.status === "APPROVED");
  const skipped = view.lines.filter((line) => !isSent(line));
  const working = busy === "approve-all";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={lines.length === 1 ? "Approve this item?" : `Approve all ${lines.length} items?`}
        description="We'll make these items exactly as shown in their artwork previews."
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy !== null || lines.length === 0} onClick={() => onConfirm(lines)}>
              {working ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {working ? "Approving…" : lines.length === 1 ? "Approve 1 item" : `Approve ${lines.length} items`}
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 py-3">
              <div className="min-w-0">
                <p className="font-medium break-words">{lineTitle(line)}</p>
                {line.status === "CHANGES_REQUESTED" ? (
                  <p className="mt-0.5 text-xs text-primary-ink">You asked for changes on this item. Approving goes ahead without them.</p>
                ) : null}
              </div>
              <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-ink">
                Version {line.current_version}
              </span>
            </li>
          ))}
        </ul>
        {approved.length > 0 || skipped.length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
            {approved.map((line) => (
              <p key={line.id}>
                {lineTitle(line)}: already approved (Version {line.approved_version ?? line.current_version})
              </p>
            ))}
            {skipped.map((line) => (
              <p key={line.id}>
                {lineTitle(line)}: {line.status === "NO_PROOF_NEEDED" ? "no preview needed" : "artwork preview coming soon, not included"}
              </p>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
