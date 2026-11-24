"use client";

import { useState, type MouseEvent, type ReactNode, type RefObject } from "react";
import {
  ArrowRight,
  Check,
  ChevronLeft,
  ChevronRight,
  CircleCheck,
  CircleX,
  Clock,
  CornerUpLeft,
  Info,
  LayoutGrid,
  Loader2,
  Undo2,
  X,
} from "lucide-react";

import { ImageStage } from "@/components/ImageStage";
import { ImageViewer } from "@/components/ImageViewer";
import { LineHistory } from "@/components/LineHistory";
import { StatusBadge } from "@/components/StatusBadge";
import { Thumb } from "@/components/Thumb";
import { VersionList } from "@/components/VersionList";
import { Button } from "@/components/ui/button";
import { formatTime, isoTime } from "@/lib/format";
import {
  goBackDetail,
  goBackLabel,
  lineOptions,
  lineTitle,
  mainVersion,
  newerVersions,
  versionImages,
  versionName,
} from "@/lib/lines";
import { isSent, type Actions, type Line, type Note, type Version, type ViewerImage } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LineActions {
  /** Approve the newest version, or go back to an older one. */
  approve: (line: Line, version: number) => void;
  /** Opens the Reject box for the newest version. */
  reject: (line: Line) => void;
  /** Takes back the item's last choice. */
  undo: (line: Line) => void;
  /** Goes on after a choice: to the item `to`, or back to the list (null). */
  next: (line: Line, to: number | null) => void;
}

/** Where to go after a choice: the next item waiting (`to`), or back to the list (null). */
export type NextStep = { label: string; to: number | null } | null;

/** The id of an item's control that focus moves to once an action answers or a box closes (CHANGES-24NOV 7.4). */
export const controlId = (control: "heading" | "approve" | "reject" | "go-back" | "undo" | "outcome", lineId: number) =>
  control === "heading" ? `review-${lineId}` : `${control}-${lineId}`;

const NOTHING: Actions = { approve: false, reject: false, go_back_to: [], undo: false };

type Viewer =
  | { kind: "version"; version: number; index: number }
  | { kind: "artwork"; index: number }
  | { kind: "pictures"; eventId: number; index: number };

/**
 * The focused review of one item: its options, the artwork preview of the version on screen with
 * the team's message, the item's versions and where each stands, and one decision: Approve or
 * Reject the newest version, or Go back to an earlier one; after a choice, what was chosen and
 * Undo. Then the customer's uploaded artwork and the item's history.
 *
 * split: the picture beside a column with the versions and the decision (wide screens). stack:
 * one column, with the decision kept in reach at the bottom of the screen (phones). Either way
 * Approve / Reject (or the outcome with Undo) come first and Go back under them.
 */
export function ReviewPanel({
  line,
  position,
  readOnly,
  busy,
  paused,
  actions,
  layout,
  framed = true,
  nav,
  next,
  headingRef,
}: {
  line: Line;
  /** "Item 2 of 5"; left out when the order has one item. */
  position?: { index: number; total: number };
  readOnly: boolean;
  busy: string | null;
  /** For a moment after an action on this item answered, its buttons ignore presses (ApprovalApp). */
  paused: boolean;
  actions: LineActions;
  layout: "split" | "stack";
  /** Drawn as a card; the full-screen review on phones has its own frame. */
  framed?: boolean;
  /** Previous / Next buttons in the header (wide screens); null when there is no item that way. */
  nav?: { previous: (() => void) | null; next: (() => void) | null };
  next: NextStep;
  headingRef?: RefObject<HTMLHeadingElement | null>;
}) {
  const title = lineTitle(line);
  const sent = isSent(line);
  const split = layout === "split";
  const newest = line.current_version;
  // Buttons come only from the API's `actions`, never worked out here; none while read-only.
  const offers = sent && !readOnly ? line.actions : NOTHING;
  const choice = sent ? line.last_choice : null;
  const phase = !choice ? "waiting" : choice.kind === "REJECTED" ? "rejected" : choice.kind === "WENT_BACK" ? "went-back" : "approved";

  // The version on screen: the default one (the approved one while it stands, else the newest), or
  // the one the customer opened in the list since their last choice or Undo. A choice or an Undo
  // shows the default again, so after going back the version gone back to is on screen. Each one
  // adds to the item's history, so its newest entry tells them apart; the last choice can't, as an
  // Undo brings an earlier one back (and with it a version opened before).
  const since = line.history[0]?.event_id ?? null;
  const [picked, setPicked] = useState<{ version: number; since: number | null } | null>(null);
  const shown =
    (picked && picked.since === since ? line.versions.find((v) => v.version === picked.version) : undefined) ?? mainVersion(line);
  const shownVersion = shown?.version ?? null;
  const [image, setImage] = useState({ version: 0, index: 0 });
  const imageIndex = image.version === shownVersion ? image.index : 0;
  const images = shown ? versionImages(line, shown) : [];
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const showVersion = (version: number) => setPicked({ version, since });

  const onNewest = shownVersion === newest;
  const earlier = sent && shownVersion !== null && shownVersion < newest;
  // Go back goes to the version on screen, or to the one before the newest while the newest is on screen.
  const goBackTo =
    shownVersion !== null && offers.go_back_to.includes(shownVersion)
      ? shownVersion
      : onNewest
        ? (offers.go_back_to[0] ?? null)
        : null;
  const busyWith = (what: string) => busy === `${what}:${line.id}`;
  // A press ignored during the pause doesn't move focus either, so it stays where the answer put it.
  const holdFocus = paused ? (event: MouseEvent) => event.preventDefault() : undefined;

  // ---- the pieces --------------------------------------------------------------------------

  // An earlier version on screen says so, except the one the customer went back to: the outcome says that.
  const decided = phase === "approved" || phase === "went-back";
  const callout =
    earlier && !(phase === "went-back" && shownVersion === choice?.version) ? (
      <Callout tone="waiting" icon={<Info className="size-4" aria-hidden />}>
        {decided && !readOnly ? "This is an earlier version. To choose it instead, first press Undo." : "This is an earlier version."}{" "}
        <TextButton onClick={() => showVersion(newest)}>See the newest, Version {newest}</TextButton>
      </Callout>
    ) : null;

  const approving = busyWith("approve");
  const approveButton = offers.approve ? (
    <Button
      id={controlId("approve", line.id)}
      size="lg"
      className="w-full px-3"
      disabled={busy !== null}
      onMouseDown={holdFocus}
      onClick={() => actions.approve(line, newest)}
    >
      {approving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      {approving ? "Approving…" : "Approve"}
    </Button>
  ) : null;
  const rejectButton = offers.reject ? (
    <Button
      id={controlId("reject", line.id)}
      variant="outline"
      size="lg"
      className="w-full px-3"
      disabled={busy !== null}
      onMouseDown={holdFocus}
      onClick={() => actions.reject(line)}
    >
      <X aria-hidden />
      Reject
    </Button>
  ) : null;

  const undoing = busyWith("undo");
  const undoButton = offers.undo ? (
    <Button
      id={controlId("undo", line.id)}
      variant="outline"
      aria-label={`Undo your last choice on ${title}`}
      className={cn("shrink-0 bg-card px-3.5", phase !== "rejected" && "border-success/40")}
      disabled={busy !== null}
      onMouseDown={holdFocus}
      onClick={() => actions.undo(line)}
    >
      {undoing ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
      {undoing ? "Undoing…" : "Undo"}
    </Button>
  ) : null;
  const undoHint = offers.undo ? (
    <p className="text-xs leading-relaxed text-muted-foreground">Undo takes back your last choice, until we start production.</p>
  ) : null;
  const nextButton =
    choice && !readOnly && next ? (
      <Button size="lg" className="w-full" onMouseDown={holdFocus} onClick={() => actions.next(line, next.to)}>
        {next.to === null ? <LayoutGrid aria-hidden /> : null}
        {next.label}
        {next.to === null ? null : <ArrowRight aria-hidden />}
      </Button>
    ) : null;

  // What the customer chose, in one line (the focus lands on it when nothing else fits).
  const headline = choice ? (
    <p id={controlId("outcome", line.id)} tabIndex={-1} className="flex min-w-0 items-start gap-1.5 leading-5 font-semibold outline-none">
      {phase === "rejected" ? (
        <CircleX className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : phase === "went-back" ? (
        <CornerUpLeft className="mt-0.5 size-4 shrink-0" aria-hidden />
      ) : (
        <CircleCheck className="mt-0.5 size-4 shrink-0" aria-hidden />
      )}
      <span>
        {phase === "rejected" ? "You rejected" : phase === "went-back" ? "You went back to" : "You approved"}{" "}
        <span className="whitespace-nowrap">{versionName(choice.version)}</span>
      </span>
    </p>
  ) : null;
  // The rejection: the customer's own note and pictures (the note of this choice; the version's as a fallback).
  const note =
    choice && phase === "rejected"
      ? (line.notes.find((n) => n.event_id === choice.event_id) ??
        line.versions.find((v) => v.version === choice.version)?.note ??
        null)
      : null;
  const details =
    choice && phase === "rejected" ? (
      <>
        {note?.body ? <NoteText text={note.body} /> : null}
        {note && note.pictures.length > 0 ? (
          <NotePictures note={note} onOpen={(index) => setViewer({ kind: "pictures", eventId: note.event_id, index })} />
        ) : null}
        {/* A locked, shipped or cancelled order gets no new version. */}
        {readOnly ? null : <p>We&apos;ll make the changes and send you a new version.</p>}
      </>
    ) : choice && phase === "went-back" ? (
      <>
        <p>
          {versionName(choice.version)} is approved, and {newerVersions(choice.version, newest)}{" "}
          {choice.version + 1 >= newest ? "is" : "are"} rejected.
        </p>
        {shownVersion !== choice.version ? (
          <TextButton tone="success" onClick={() => showVersion(choice.version)}>
            Show {versionName(choice.version)}
          </TextButton>
        ) : null}
      </>
    ) : null;
  const tone = phase === "rejected" ? "border-border bg-surface" : "border-success/30 bg-success-soft text-success";

  // The whole outcome in one box, as wide screens show it (phones too, when an earlier version is
  // on screen): "You rejected Version 2 [Undo]", when, then the details. Undo keeps its place beside
  // the sentence whatever was chosen, so a second press of a double click lands on an Undo too.
  const outcomeBox = choice ? (
    <div className={cn("space-y-2.5 rounded-xl border px-3.5 py-3 text-sm leading-relaxed", tone)}>
      <div>
        <div className="flex items-center justify-between gap-3">
          {headline}
          {undoButton}
        </div>
        {/* On phones the time is in the item's history, so the outcome stays short. */}
        {split && choice.at ? (
          <time dateTime={isoTime(choice.at)} className="block text-xs">
            {formatTime(choice.at)}
          </time>
        ) : null}
      </div>
      {details}
    </div>
  ) : null;

  const decision = !sent ? null : choice ? (
    <div className="space-y-3">
      {outcomeBox}
      {undoHint}
      {nextButton}
    </div>
  ) : offers.approve && onNewest ? (
    <div className="space-y-3">
      <div className="grid gap-2">
        {approveButton}
        {rejectButton}
      </div>
      <p className="text-xs leading-relaxed text-muted-foreground">
        Approving means we&apos;ll make this item exactly as shown. Not quite right? Choose Reject and tell us what to change.
      </p>
    </div>
  ) : readOnly ? (
    <Callout icon={<Info className="size-4" aria-hidden />}>This item can&apos;t be changed any more.</Callout>
  ) : null; // An earlier version on screen: the callout and Go back are the action.

  const goingBack = busyWith("go-back");
  const goBackId = controlId("go-back", line.id);
  const goBackButton =
    goBackTo !== null ? (
      <Button
        id={goBackId}
        variant="outline"
        className="h-auto w-full flex-col gap-0.5 px-4 py-2.5 text-center whitespace-normal"
        aria-labelledby={`${goBackId}-label`}
        aria-describedby={`${goBackId}-detail`}
        disabled={busy !== null}
        onMouseDown={holdFocus}
        onClick={() => actions.approve(line, goBackTo)}
      >
        <span className="flex items-center gap-2 font-semibold">
          {goingBack ? <Loader2 className="animate-spin" aria-hidden /> : <CornerUpLeft aria-hidden />}
          <span id={`${goBackId}-label`}>{goingBack ? "Going back…" : goBackLabel(goBackTo)}</span>
        </span>
        <span id={`${goBackId}-detail`} className="text-xs font-normal text-balance text-muted-foreground">
          {goBackDetail(goBackTo, newest)}
        </span>
      </Button>
    ) : null;
  const goBackBlock = goBackButton ? (
    <div className="space-y-1.5">
      {goBackButton}
      {onNewest && newest >= 3 ? (
        <p className="text-xs leading-relaxed text-muted-foreground">To go back further, open that version in the list above.</p>
      ) : null}
    </div>
  ) : null;

  const noPreviewNote =
    shown && line.status === "NO_PROOF_NEEDED" ? (
      <Callout icon={<CircleCheck className="size-4" aria-hidden />}>
        No preview needed: we&apos;ll make this item exactly as you ordered it.
      </Callout>
    ) : null;
  const stage = shown ? (
    <ImageStage
      images={images}
      index={imageIndex}
      onIndexChange={(index) => setImage({ version: shown.version, index })}
      onEnlarge={(index) => setViewer({ kind: "version", version: shown.version, index })}
    />
  ) : (
    <Placeholder line={line} readOnly={readOnly} />
  );
  const versions = shown ? <VersionList line={line} readOnly={readOnly} shown={shown.version} onSelect={showVersion} /> : null;
  const artwork = <UploadedArtwork line={line} onOpen={(index) => setViewer({ kind: "artwork", index })} />;

  // Phones (CHANGES-24NOV 7.4): what sits just above the sticky area, in it, and just below it.
  let above: ReactNode = null;
  let sticky: ReactNode = null;
  let below: ReactNode = null;
  if (!sent || readOnly) {
    above = (
      <>
        {callout}
        {decision}
      </>
    );
  } else if (!choice && onNewest && (approveButton || rejectButton)) {
    sticky = (
      <div className="grid grid-cols-2 gap-2">
        {rejectButton}
        {approveButton}
      </div>
    );
    below = goBackBlock;
  } else if (earlier && goBackButton && (phase === "waiting" || phase === "rejected")) {
    above = (
      <>
        {callout}
        {phase === "rejected" ? decision : null}
      </>
    );
    sticky = goBackButton;
  } else if (choice) {
    above = (
      <>
        {callout}
        {details ? <div className={cn("space-y-2 rounded-xl px-3.5 py-3 text-sm leading-relaxed", tone)}>{details}</div> : null}
        {undoHint}
      </>
    );
    // Row 2 sits where Approve and Reject were, so what appears there after a choice is never Undo.
    sticky = (
      <div className="space-y-2.5">
        <div className="flex items-center justify-between gap-3">
          <div className={cn("min-w-0 text-sm", phase !== "rejected" && "text-success")}>{headline}</div>
          {undoButton}
        </div>
        {nextButton}
      </div>
    );
    below = goBackBlock;
  } else {
    above = (
      <>
        {callout}
        {decision}
      </>
    );
    below = goBackBlock;
  }

  const viewerImages: ViewerImage[] = (() => {
    if (!viewer) return [];
    if (viewer.kind === "artwork") {
      const count = line.customer_artwork.length;
      return line.customer_artwork.map((a, i) => ({ src: a.url, alt: `Your uploaded artwork, ${i + 1} of ${count}` }));
    }
    if (viewer.kind === "pictures") {
      const pictures = line.notes.find((n) => n.event_id === viewer.eventId)?.pictures ?? note?.pictures ?? [];
      return pictures.map((p, i, all) => ({ src: p.url, alt: `Your picture ${i + 1} of ${all.length}` }));
    }
    const version = line.versions.find((v) => v.version === viewer.version);
    return version ? versionImages(line, version) : [];
  })();
  const viewerTitle =
    viewer?.kind === "artwork"
      ? "Your uploaded artwork"
      : viewer?.kind === "pictures"
        ? "Your pictures"
        : `${title} · ${viewer ? versionName(viewer.version) : ""}`;

  const pad = split ? "px-6 xl:px-7" : "px-4";
  // Beside the list (wide screens) the item's status sits in the "Item 2 of 5" row, so a long
  // name keeps the whole width and the artwork starts higher up. The heading still names it when focused.
  const topRow = Boolean(position || nav);
  const statusId = `review-${line.id}-status`;
  const status = <StatusBadge id={statusId} line={line} readOnly={readOnly} className={topRow ? undefined : "mt-1"} />;

  return (
    <article
      aria-labelledby={`review-${line.id}`}
      className={cn("bg-card", framed && "rounded-2xl border border-border/70 shadow-sm")}
    >
      <header className={cn("space-y-3 pt-5", pad, split && "xl:pt-6")}>
        {topRow ? (
          <div className="flex min-h-11 flex-wrap items-center justify-between gap-2">
            <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
              <p className="text-xs font-semibold tracking-[0.14em] text-muted-foreground uppercase">
                {position ? `Item ${position.index} of ${position.total}` : ""}
              </p>
              {status}
            </div>
            {nav ? (
              <div className="flex gap-2">
                <Button variant="outline" className="px-3" disabled={!nav.previous} onClick={() => nav.previous?.()}>
                  <ChevronLeft aria-hidden />
                  Previous
                </Button>
                <Button variant="outline" className="px-3" disabled={!nav.next} onClick={() => nav.next?.()}>
                  Next
                  <ChevronRight aria-hidden />
                </Button>
              </div>
            ) : null}
          </div>
        ) : null}
        <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
          <h2
            ref={headingRef}
            id={controlId("heading", line.id)}
            aria-describedby={topRow ? statusId : undefined}
            tabIndex={-1}
            className="min-w-0 flex-1 text-xl leading-snug font-semibold break-words outline-none sm:text-2xl"
          >
            {title}
          </h2>
          {topRow ? null : status}
        </div>
        <Options line={line} />
      </header>

      {split && shown ? (
        <div className={cn("grid gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_260px] xl:grid-cols-[minmax(0,1fr)_300px]", pad)}>
          <div className="min-w-0">{stage}</div>
          <div className="min-w-0 space-y-5">
            {versions}
            <TeamMessage key={shown.version} version={shown} />
            {callout}
            {decision ?? noPreviewNote}
            {goBackBlock}
            {artwork}
          </div>
        </div>
      ) : split ? (
        <div className={cn("space-y-5 py-5", pad)}>
          {stage}
          {artwork}
        </div>
      ) : (
        <div className={cn("space-y-4 py-4", pad)}>
          {stage}
          {versions}
          {shown ? <TeamMessage key={shown.version} version={shown} compact /> : null}
          {noPreviewNote}
          {above}
          {sticky ? (
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/70 bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-8px_rgb(28_28_25/0.15)] backdrop-blur">
              {sticky}
            </div>
          ) : null}
          {below}
          {artwork}
          <LineHistory line={line} />
        </div>
      )}

      {split && line.history.length > 0 ? (
        <div className={cn("border-t border-border/70 py-5", pad)}>
          <LineHistory line={line} />
        </div>
      ) : null}

      <ImageViewer
        images={viewerImages}
        index={viewer ? viewer.index : null}
        onIndexChange={(index) => {
          if (!viewer) return;
          setViewer({ ...viewer, index });
          // Closing the viewer leaves the page on the image looked at last.
          if (viewer.kind === "version" && viewer.version === shownVersion) setImage({ version: viewer.version, index });
        }}
        onClose={() => setViewer(null)}
        title={viewerTitle}
      />
    </article>
  );
}

function Options({ line }: { line: Line }) {
  const options = lineOptions(line);
  if (options.length === 0) return null;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Options">
      {options.map((option, i) => (
        <li key={`${option.label}:${option.value}:${i}`} className="rounded-full bg-muted px-2.5 py-1 text-xs font-medium">
          <span className="sr-only">{option.label}: </span>
          {option.value}
        </li>
      ))}
    </ul>
  );
}

/** The team's message for a version, as a chat bubble. Long messages fold (to three lines on phones). */
function TeamMessage({ version, compact = false }: { version: Version; compact?: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const text = version.message?.trim() ?? "";
  const sentAt = formatTime(version.sent_at);
  const when = sentAt ? <time dateTime={isoTime(version.sent_at)}>{sentAt}</time> : null;
  if (!text) {
    return when ? (
      <p className="text-xs text-muted-foreground">
        Version {version.version} sent {when}
      </p>
    ) : null;
  }
  const long = compact ? text.length > 130 || text.split("\n").length > 3 : text.length > 220 || text.split("\n").length > 4;
  return (
    <figure className="flex gap-2.5">
      <span
        aria-hidden
        className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-foreground text-[10px] font-bold tracking-wide text-primary"
      >
        HB
      </span>
      <div className="min-w-0 flex-1">
        <figcaption className="mb-1.5 text-xs text-muted-foreground">
          <span className="block font-semibold text-foreground">Message from our team</span>
          {when ? <span className="block">{when}</span> : null}
        </figcaption>
        <blockquote
          className={cn(
            "rounded-2xl rounded-tl-md bg-primary-soft px-3.5 py-2.5 text-sm leading-relaxed break-words whitespace-pre-wrap",
            long && !expanded && (compact ? "line-clamp-3" : "line-clamp-4"),
          )}
        >
          {text}
        </blockquote>
        {long ? (
          <Button variant="link" className="-ml-2 px-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
            {expanded ? "Show less" : "Show the whole message"}
          </Button>
        ) : null}
      </div>
    </figure>
  );
}

/** The customer's note on a rejected version, folded to three lines when it is longer. */
function NoteText({ text }: { text: string }) {
  const [expanded, setExpanded] = useState(false);
  const long = text.length > 140 || text.split("\n").length > 3;
  return (
    <div>
      <blockquote className={cn("break-words whitespace-pre-wrap", long && !expanded && "line-clamp-3")}>“{text}”</blockquote>
      {long ? (
        <Button variant="link" className="-ml-2 px-2 text-xs" aria-expanded={expanded} onClick={() => setExpanded(!expanded)}>
          {expanded ? "Show less" : "Show the whole note"}
        </Button>
      ) : null}
    </div>
  );
}

/** The pictures the customer added to a rejection, small; each opens full size. */
function NotePictures({ note, onOpen }: { note: Note; onOpen: (index: number) => void }) {
  const count = note.pictures.length;
  return (
    <ul className="flex flex-wrap gap-1.5" aria-label="Your pictures">
      {note.pictures.map((picture, i) => (
        <li key={`${picture.id}:${picture.url}`}>
          <button
            type="button"
            onClick={() => onOpen(i)}
            aria-label={`Show your picture ${i + 1} of ${count}`}
            className="block size-14 overflow-hidden rounded-lg border border-border bg-card focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
          >
            <Thumb key={picture.url} src={picture.url} alt="" className="object-cover" />
          </button>
        </li>
      ))}
    </ul>
  );
}

/** A link-styled button inside a sentence, with a 44 px tall tap area that doesn't push the lines apart. */
function TextButton({ tone, onClick, children }: { tone?: "success"; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      className={cn(
        "-my-3 rounded py-3 text-left font-semibold underline underline-offset-2 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        tone === "success" ? "text-success" : "text-primary-ink",
      )}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function Callout({ icon, tone = "muted", children }: { icon: ReactNode; tone?: "muted" | "waiting"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex gap-2.5 rounded-xl px-3.5 py-3 text-sm leading-relaxed",
        tone === "waiting" ? "bg-primary-soft text-foreground" : "bg-muted text-foreground",
      )}
    >
      <span className="mt-0.5 shrink-0">{icon}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/** No artwork preview to show: none is needed, or it isn't ready yet. */
function Placeholder({ line, readOnly }: { line: Line; readOnly: boolean }) {
  const noPreview = line.status === "NO_PROOF_NEEDED";
  const [heading, text] = noPreview
    ? ["No preview needed", "We'll make this item exactly as you ordered it."]
    : readOnly
      ? ["No artwork preview", "We didn't send an artwork preview for this item."]
      : ["Artwork preview coming soon", "We're preparing it now and will email you as soon as it's ready to review."];
  return (
    <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-input bg-surface px-6 py-12 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-card shadow-sm ring-1 ring-border">
        {noPreview ? <CircleCheck className="size-5 text-success" aria-hidden /> : <Clock className="size-5" aria-hidden />}
      </span>
      <div>
        <p className="font-semibold">{heading}</p>
        <p className="mt-1 max-w-xs text-sm text-muted-foreground">{text}</p>
      </div>
    </div>
  );
}

/** The files the customer uploaded at checkout, to compare with the preview. */
function UploadedArtwork({ line, onOpen }: { line: Line; onOpen: (index: number) => void }) {
  const count = line.customer_artwork.length;
  if (count === 0) return null;
  return (
    <section aria-labelledby={`artwork-${line.id}`} className="space-y-2">
      <h3 id={`artwork-${line.id}`} className="text-sm font-semibold">
        Your uploaded artwork
      </h3>
      <ul className="flex flex-wrap gap-2">
        {line.customer_artwork.map((art, i) => (
          <li key={`${i}:${art.url}`}>
            <button
              type="button"
              onClick={() => onOpen(i)}
              aria-label={`Show your uploaded artwork ${i + 1} of ${count}`}
              className="block size-14 overflow-hidden rounded-lg border border-border bg-surface p-0.5 transition hover:border-input focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
            >
              <Thumb key={art.url} src={art.url} alt="" className="rounded-md" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
