import type { ReactNode, Ref } from "react";
import { Ban, CircleCheck, Clock, Lock, PencilLine, Truck } from "lucide-react";

import { ProgressBar } from "@/components/SummaryBar";
import { formatDate } from "@/lib/format";
import { needsReview } from "@/lib/lines";
import { allSentApproved, type PublicView, type ReadOnlyReason } from "@/lib/types";
import { cn } from "@/lib/utils";

const READ_ONLY: Record<ReadOnlyReason, { icon: ReactNode; title: string; body: string }> = {
  LOCKED: {
    icon: <Lock className="size-5" aria-hidden />,
    title: "Your order is in production",
    body: "Your choices are final now.",
  },
  SHIPPED: {
    icon: <Truck className="size-5" aria-hidden />,
    title: "Your order has shipped",
    body: "This page can't be changed any more.",
  },
  CANCELLED: {
    icon: <Ban className="size-5" aria-hidden />,
    title: "This order was cancelled",
    body: "This page can't be changed any more.",
  },
};

/**
 * The top of the page: the order, what to do in one sentence, and how far along the approvals
 * are (with Approve all on wide screens; on phones it follows the items, so the customer sees the
 * artwork first). When the order can't change any more, or everything is approved, it says so.
 * Kept short so the first items show on the first screen of a phone or laptop.
 */
export function Hero({ view, progressRef, approveAll }: { view: PublicView; progressRef: Ref<HTMLDivElement>; approveAll: ReactNode }) {
  const { order, state } = view;
  const placed = formatDate(order.placed_at);

  return (
    <section aria-labelledby="page-title" className="overflow-hidden rounded-2xl border border-border/70 bg-card shadow-sm">
      {/* The brand's yellow accent bar (the shop uses primary for fills and accent bars). */}
      <div aria-hidden className="h-1 bg-primary" />
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-10">
        <div className="min-w-0 space-y-3">
          <p className="flex flex-wrap gap-x-1.5 text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
            <span className="whitespace-nowrap">Order {order.number}</span>
            {placed ? (
              <>
                <span aria-hidden>·</span>
                <span className="font-medium whitespace-nowrap">placed {placed}</span>
              </>
            ) : null}
          </p>
          <h1 id="page-title" className="text-[28px] leading-tight font-bold tracking-tight sm:text-4xl">
            Review your artwork
          </h1>
          <p className="max-w-xl text-[15px] leading-relaxed text-muted-foreground">
            {order.first_name ? `Hi ${order.first_name}, here's` : "Here's"} how your order will look.
          </p>
          {state.read_only ? null : (
            <p className="max-w-xl text-[15px] leading-relaxed">
              Check each item. Approve it if it looks right, or reject it and tell us what to change. You can undo until we
              start production.
            </p>
          )}
          <StateNote view={view} />
        </div>
        <div ref={progressRef} className="self-start rounded-xl bg-surface p-4 sm:p-5">
          <Progress view={view} />
          {approveAll ? <div className="mt-4">{approveAll}</div> : null}
        </div>
      </div>
    </section>
  );
}

function Progress({ view }: { view: PublicView }) {
  const { approved_count: approved, total_count: total, status, read_only: readOnly } = view.state;
  const toReview = view.lines.filter(needsReview).length;
  const rejected = view.lines.filter((l) => l.status === "CHANGES_REQUESTED").length;
  const line =
    total === 0
      ? "No artwork to approve yet."
      : status === "APPROVED"
        ? "Nothing left to review."
        : readOnly
          ? `${total - approved} ${total - approved === 1 ? "item wasn't" : "items weren't"} approved.`
          : toReview > 0
            ? `${toReview} ${toReview === 1 ? "item" : "items"} waiting for you.`
            : status === "CHANGES_REQUESTED"
              ? rejected > 1
                ? "We're making new versions of the items you rejected."
                : "We're making a new version of the item you rejected."
              : status === "DRAFT"
                ? "We'll email you when they're ready."
                : "We'll email you when the rest are ready.";
  return (
    <div>
      <p className="flex items-baseline gap-1.5">
        <span className="text-3xl font-bold tabular-nums">{approved}</span>
        <span className="text-sm text-muted-foreground">of {total} approved</span>
      </p>
      <ProgressBar view={view} className="mt-3" />
      <p className="mt-2.5 flex items-center gap-2 text-sm">
        {status === "APPROVED" ? (
          <CircleCheck className="size-4 shrink-0 text-success" aria-hidden />
        ) : toReview > 0 && !readOnly ? (
          <span className="size-2 shrink-0 rounded-full bg-primary-ink" aria-hidden />
        ) : null}
        {line}
      </p>
    </div>
  );
}

/** One short line about where the whole order stands, when there is something to say. */
function StateNote({ view }: { view: PublicView }) {
  const { state } = view;
  const contact = view.support_email ? ` If something needs to change, email us at ${view.support_email}.` : "";

  if (state.read_only) {
    const closed = state.reason
      ? READ_ONLY[state.reason]
      : { icon: <Lock className="size-5" aria-hidden />, title: "This page can't be changed any more", body: "" };
    return (
      <Banner tone="muted" icon={closed.icon} title={closed.title}>
        {closed.body}
        {contact}
      </Banner>
    );
  }
  if (state.status === "APPROVED") {
    return (
      <Banner tone="success" icon={<CircleCheck className="size-5" aria-hidden />} title="Everything is approved. Thank you!">
        We&apos;ll start production soon. Until then, you can still undo a choice.
      </Banner>
    );
  }
  if (state.status === "DRAFT") {
    return (
      <Banner tone="muted" icon={<Clock className="size-5" aria-hidden />} title="Your artwork previews are on their way">
        We&apos;re preparing them now and will email you as soon as they&apos;re ready.
      </Banner>
    );
  }
  if (state.status === "CHANGES_REQUESTED") {
    return (
      <Banner tone="waiting" icon={<PencilLine className="size-5" aria-hidden />} title="Thanks! We're working on your changes">
        We&apos;ll email you when the new version is ready to check.
        {view.lines.some(needsReview) ? " Meanwhile, you can check the other items." : null}
      </Banner>
    );
  }
  if (allSentApproved(view) && view.lines.some((line) => line.status === "NOT_SENT")) {
    return (
      <Banner tone="success" icon={<CircleCheck className="size-5" aria-hidden />} title="Thank you!">
        You&apos;ve approved every artwork preview we&apos;ve sent so far. We&apos;ll email you when the rest are ready.
      </Banner>
    );
  }
  return null;
}

function Banner({
  tone,
  icon,
  title,
  children,
}: {
  tone: "muted" | "success" | "waiting";
  icon: ReactNode;
  title: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        "flex gap-3 rounded-xl border px-4 py-3",
        tone === "success" && "border-success/30 bg-success-soft text-success",
        tone === "waiting" && "border-primary bg-primary-soft",
        tone === "muted" && "border-input bg-muted",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="space-y-0.5 text-sm">
        <h2 className="font-semibold">{title}</h2>
        <p className={cn(tone === "success" ? "text-success" : "text-muted-foreground")}>{children}</p>
      </div>
    </div>
  );
}
