"use client";

import type { ComponentProps, ReactNode } from "react";
import { CheckCheck, CircleCheck, Loader2, Undo2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import { lineTitle } from "@/lib/lines";
import { linesToApprove, type Line, type PublicView } from "@/lib/types";
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
 * Approve all: a button that approves the newest version of every item still waiting for the
 * customer (offered for two or more), and after it, what it did with an Undo while that can still
 * be undone. compact: the slim bar at the top, which holds only the button.
 */
export function ApproveAll({
  view,
  busy,
  compact = false,
  onApprove,
  onUndo,
}: {
  view: PublicView;
  busy: string | null;
  compact?: boolean;
  onApprove: () => void;
  onUndo: () => void;
}) {
  const waiting = linesToApprove(view).length;
  const readOnly = view.state.read_only;
  const offered = !readOnly && waiting >= 2;
  const batch = !compact && !readOnly && view.last_batch?.undoable ? view.last_batch : null;
  if (!offered && !batch) return null;

  if (compact) {
    return (
      <Button variant="outline" className="shrink-0 px-3.5" disabled={busy !== null} onClick={onApprove}>
        <CheckCheck aria-hidden />
        Approve all ({waiting})
      </Button>
    );
  }

  const undoing = busy === "undo-all";
  const size = batch?.size ?? 0;
  // An item changed on its own since keeps that choice, so the Undo takes back only the batch's
  // approvals still standing. When that's fewer than it approved, say how many.
  const standing = batch ? view.lines.filter((line) => line.last_choice?.batch_id === batch.batch_id).length : 0;
  const partly = standing > 0 && standing < size;
  return (
    <div className="space-y-3">
      {batch ? (
        <div className="flex items-center justify-between gap-3 rounded-xl border border-success/30 bg-success-soft py-2 pr-2 pl-3.5 text-success">
          <p id="batch-outcome" tabIndex={-1} className="flex min-w-0 items-center gap-1.5 text-sm font-semibold outline-none">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            <span>
              You approved {size === 1 ? "1 item" : size > 1 ? `${size} items` : "these items"} at once.
              {partly ? (
                <span id="batch-undo-reach" className="block text-xs font-normal text-balance">
                  Undo takes back {standing} of them.
                </span>
              ) : null}
            </span>
          </p>
          <Button
            variant="outline"
            aria-label="Undo Approve all"
            aria-describedby={partly ? "batch-undo-reach" : undefined}
            className="shrink-0 border-success/40 bg-card px-3.5"
            disabled={busy !== null}
            onClick={onUndo}
          >
            {undoing ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
            {undoing ? "Undoing…" : "Undo"}
          </Button>
        </div>
      ) : null}
      {offered ? (
        <div className="space-y-1.5">
          <Button id="approve-all" variant="outline" size="lg" className="w-full" disabled={busy !== null} onClick={onApprove}>
            <CheckCheck aria-hidden />
            Approve all {waiting} items
          </Button>
          <p className="text-xs text-muted-foreground">Approves the newest version of each item waiting for you.</p>
        </div>
      ) : null}
    </div>
  );
}

/**
 * A slim bar that slides in at the top once the summary has scrolled away: the order, the
 * progress and the Approve all button stay in reach. Hidden, it is inert, so it can't be tabbed to.
 */
export function StickyBar({
  view,
  visible,
  approveAll,
}: {
  view: PublicView;
  visible: boolean;
  /** The Approve all button, when the order offers it. */
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

/** Why Approve all leaves an item alone, or null for an item it would approve. */
function leftAlone(line: Line): string | null {
  switch (line.status) {
    case "APPROVED":
      return line.approved_version !== null && line.approved_version < line.current_version
        ? `already approved (Version ${line.approved_version})`
        : "already approved";
    case "CHANGES_REQUESTED":
      return "you rejected it, so it's not included";
    case "NO_PROOF_NEEDED":
      return "no preview needed";
    case "NOT_SENT":
      return "artwork preview coming soon, not included";
    default:
      return null;
  }
}

/**
 * "Approve all 3 items?": each item it approves with its newest version, then what it leaves alone.
 * `view` is the page as it was when the sheet opened, so its words stay put while it closes.
 */
export function ApproveAllSheet({
  view,
  open,
  busy,
  onOpenChange,
  onConfirm,
  onCloseAutoFocus,
}: {
  view: PublicView;
  open: boolean;
  busy: string | null;
  onOpenChange: (open: boolean) => void;
  onConfirm: (lines: Line[]) => void;
  onCloseAutoFocus: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
}) {
  const lines = linesToApprove(view);
  const rest = view.lines.flatMap((line) => {
    const why = line.actions.approve ? null : leftAlone(line);
    return why ? [{ line, why }] : [];
  });
  const working = busy === "approve-all";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={`Approve all ${lines.length} items?`}
        description="We'll make each of these items exactly as shown in its newest artwork preview."
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button disabled={busy !== null || lines.length < 2} onClick={() => onConfirm(lines)}>
              {working ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {working ? "Approving…" : `Approve ${lines.length} items`}
            </Button>
          </>
        }
      >
        <ul className="divide-y divide-border">
          {lines.map((line) => (
            <li key={line.id} className="flex items-start justify-between gap-3 py-3">
              <p className="min-w-0 font-medium break-words">{lineTitle(line)}</p>
              <span className="shrink-0 rounded-full bg-primary-soft px-2.5 py-1 text-xs font-semibold text-primary-ink">
                Version {line.current_version}
              </span>
            </li>
          ))}
        </ul>
        {rest.length > 0 ? (
          <div className="mt-3 space-y-1 border-t border-border pt-3 text-sm text-muted-foreground">
            {rest.map(({ line, why }) => (
              <p key={line.id}>
                {lineTitle(line)}: {why}
              </p>
            ))}
          </div>
        ) : null}
      </SheetContent>
    </Sheet>
  );
}
