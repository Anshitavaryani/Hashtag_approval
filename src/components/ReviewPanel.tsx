"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { ArrowRight, Check, ChevronLeft, ChevronRight, CircleCheck, Clock, Info, LayoutGrid, Loader2, PencilLine, Undo2 } from "lucide-react";

import { ImageStage } from "@/components/ImageStage";
import { ImageViewer } from "@/components/ImageViewer";
import { LineHistory } from "@/components/LineHistory";
import { NoteSheet } from "@/components/NoteSheet";
import { NotesList } from "@/components/NotesList";
import { StatusBadge } from "@/components/StatusBadge";
import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { formatTime, isoTime } from "@/lib/format";
import { lineOptions, lineTitle, mainVersion, versionImages, versionName } from "@/lib/lines";
import type { Outcome } from "@/lib/outcome";
import { isSent, type Line, type Note, type Version, type ViewerImage } from "@/lib/types";
import { cn } from "@/lib/utils";

export interface LineActions {
  approve: (line: Line, version: number) => Promise<Outcome>;
  undo: (line: Line) => Promise<Outcome>;
  addNote: (line: Line, form: FormData) => Promise<Outcome>;
  toggleNote: (note: Note) => Promise<Outcome>;
}

/** Where to go once this item is approved: the next item waiting, or back to the list (`back`). */
export type NextStep = { label: string; go: () => void; back?: boolean } | null;

type Viewer =
  | { kind: "version"; version: number; index: number }
  | { kind: "artwork"; index: number }
  | { kind: "photos"; eventId: number; index: number };

/**
 * The focused review of one item: its options, the artwork preview of the version on screen
 * (with the team's message), Approve artwork / Request changes, the customer's notes and the
 * item's history.
 *
 * split: the picture and the decision side by side (wide screens). stack: one column, with the
 * decision kept in reach at the bottom of the screen while the item is in view (phones).
 */
export function ReviewPanel({
  line,
  position,
  readOnly,
  busy,
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
  const writable = sent && !readOnly;
  const split = layout === "split";

  // The version on screen: the approved one while it stands, else the newest, unless the customer picked another.
  const [picked, setPicked] = useState<number | null>(null);
  const shown = line.versions.find((v) => v.version === picked) ?? mainVersion(line);
  const [imageIndex, setImageIndex] = useState(0);
  const images = shown ? versionImages(line, shown) : [];
  const many = line.versions.length > 1;

  const [viewer, setViewer] = useState<Viewer | null>(null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [about, setAbout] = useState<number | null>(null);

  // After Approve the Undo button takes focus, and the other way round, so keyboard and
  // screen-reader users aren't dropped at the top of the page when the button they used goes away.
  const approveButton = useRef<HTMLButtonElement>(null);
  const undoButton = useRef<HTMLButtonElement>(null);
  const focusNext = useRef<"approve" | "undo" | null>(null);
  const [, setFocusRequest] = useState(0);
  useEffect(() => {
    if (!focusNext.current) return;
    const target = focusNext.current === "undo" ? undoButton.current : approveButton.current;
    target?.focus();
    focusNext.current = null;
  });
  // One more render after the ref is set, so the effect above runs with the new buttons.
  const moveFocus = (to: "approve" | "undo") => {
    focusNext.current = to;
    setFocusRequest((n) => n + 1);
  };

  const approve = async (version: number) => {
    const outcome = await actions.approve(line, version);
    if (outcome.status === "done") moveFocus("undo");
  };
  const undo = async () => {
    const outcome = await actions.undo(line);
    if (outcome.status === "done") moveFocus("approve");
  };
  const showVersion = (version: number) => {
    setPicked(version);
    setImageIndex(0);
  };
  const requestChanges = (fileId: number | null) => {
    setAbout(fileId);
    setNoteOpen(true);
  };

  const viewerImages: ViewerImage[] = (() => {
    if (!viewer) return [];
    if (viewer.kind === "artwork") {
      const count = line.customer_artwork.length;
      return line.customer_artwork.map((a, i) => ({ src: a.url, alt: `Your uploaded artwork, ${i + 1} of ${count}` }));
    }
    if (viewer.kind === "photos") {
      const note = line.notes.find((n) => n.event_id === viewer.eventId);
      return (note?.pictures ?? []).map((p, i, all) => ({ src: p.url, alt: `Your photo, ${i + 1} of ${all.length}` }));
    }
    const version = line.versions.find((v) => v.version === viewer.version);
    return version ? versionImages(line, version) : [];
  })();
  const viewerTitle =
    viewer?.kind === "artwork"
      ? "Your uploaded artwork"
      : viewer?.kind === "photos"
        ? "Your photos"
        : `${title} · ${viewer ? versionName(line, viewer.version) : ""}`;
  const viewerAction =
    viewer?.kind === "version" && writable && viewer.version === shown?.version
      ? (index: number) => (
          <Button
            variant="secondary"
            onClick={() => {
              setViewer(null);
              requestChanges(images.length > 1 ? (shown?.files[index]?.id ?? null) : null);
            }}
          >
            <PencilLine aria-hidden />
            {images.length > 1 ? "Request changes to this image" : "Request changes"}
          </Button>
        )
      : undefined;

  const decision =
    shown && sent ? (
      <Decision
        line={line}
        version={shown.version}
        readOnly={readOnly}
        busy={busy}
        compact={!split}
        onApprove={approve}
        onUndo={undo}
        onRequest={() => requestChanges(null)}
        onShowVersion={showVersion}
        next={next}
        approveButton={approveButton}
        undoButton={undoButton}
      />
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
      onIndexChange={setImageIndex}
      onEnlarge={(index) => setViewer({ kind: "version", version: shown.version, index })}
    />
  ) : (
    <Placeholder line={line} readOnly={readOnly} />
  );
  const artwork = <UploadedArtwork line={line} onOpen={(index) => setViewer({ kind: "artwork", index })} />;
  // The switcher's tabs control everything below them that belongs to the version on screen.
  const tabPanel =
    many && shown
      ? { role: "tabpanel", id: `versions-${line.id}-panel`, "aria-labelledby": `versions-${line.id}-tab-${shown.version}` }
      : {};
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
            id={`review-${line.id}`}
            aria-describedby={topRow ? statusId : undefined}
            tabIndex={-1}
            className="min-w-0 flex-1 text-xl leading-snug font-semibold break-words outline-none sm:text-2xl"
          >
            {title}
          </h2>
          {topRow ? null : status}
        </div>
        <Options line={line} />
        {shown ? <VersionSwitcher line={line} selected={shown.version} onSelect={showVersion} /> : null}
      </header>

      {split && shown ? (
        <div {...tabPanel} className={cn("grid gap-6 py-5 lg:grid-cols-[minmax(0,1fr)_250px] xl:grid-cols-[minmax(0,1fr)_300px]", pad)}>
          <div className="min-w-0">{stage}</div>
          <div className="space-y-5">
            <TeamMessage key={shown.version} version={shown} />
            {decision ?? noPreviewNote}
            {artwork}
          </div>
        </div>
      ) : split ? (
        <div className={cn("space-y-5 py-5", pad)}>
          {stage}
          {artwork}
        </div>
      ) : (
        <div {...tabPanel} className={cn("space-y-4 py-4", pad)}>
          {stage}
          {shown ? <TeamMessage key={shown.version} version={shown} compact /> : null}
          {noPreviewNote}
          {decision && writable ? (
            <div className="sticky bottom-0 z-10 -mx-4 border-t border-border/70 bg-card/95 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] shadow-[0_-6px_16px_-8px_rgb(28_28_25/0.15)] backdrop-blur">
              {decision}
            </div>
          ) : (
            decision
          )}
        </div>
      )}

      {line.notes.length > 0 || line.history.length > 0 || (!split && line.customer_artwork.length > 0) ? (
        <div className={cn("space-y-5 border-t border-border/70 py-5", pad)}>
          <NotesList
            line={line}
            readOnly={readOnly}
            busy={busy}
            onToggle={(note) => actions.toggleNote(note)}
            onShowPhotos={(note, index) => setViewer({ kind: "photos", eventId: note.event_id, index })}
            onShowImage={(version, index) => setViewer({ kind: "version", version, index })}
          />
          {split ? null : artwork}
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
          if (viewer.kind === "version" && viewer.version === shown?.version) setImageIndex(index);
        }}
        onClose={() => setViewer(null)}
        title={viewerTitle}
        action={viewerAction}
      />

      {writable && shown ? (
        <NoteSheet
          open={noteOpen}
          onOpenChange={setNoteOpen}
          itemTitle={title}
          version={shown.version}
          versionLabel={versionName(line, shown.version)}
          images={shown.files.map((file, i) => ({ fileId: file.id, src: images[i]?.src ?? file.url }))}
          about={about}
          onAboutChange={setAbout}
          askUndo={line.status === "APPROVED"}
          sending={busy === `add-note:${line.id}`}
          disabled={busy !== null}
          onSend={(form) => actions.addNote(line, form)}
        />
      ) : null}
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

/** "Version 2 (latest) | Version 1", the approved one marked. With one version there is nothing to switch. */
function VersionSwitcher({ line, selected, onSelect }: { line: Line; selected: number; onSelect: (version: number) => void }) {
  const tabs = useRef(new Map<number, HTMLButtonElement>());
  // Newest first.
  const versions = [...line.versions].reverse();
  const approvedVersion = line.status === "APPROVED" ? line.approved_version : null;

  if (versions.length < 2) return null;

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, position: number) => {
    const moves: Record<string, number> = { ArrowRight: position + 1, ArrowLeft: position - 1, Home: 0, End: versions.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const target = versions[(moves[event.key] + versions.length) % versions.length];
    onSelect(target.version);
    tabs.current.get(target.version)?.focus();
  };

  return (
    <div
      role="tablist"
      aria-label={`Versions of ${lineTitle(line)}`}
      className="flex max-w-full gap-1 overflow-x-auto rounded-xl bg-muted p-1 sm:inline-flex"
    >
      {versions.map((v, position) => {
        const active = v.version === selected;
        return (
          <button
            key={v.version}
            ref={(node) => {
              if (node) tabs.current.set(v.version, node);
              else tabs.current.delete(v.version);
            }}
            type="button"
            role="tab"
            id={`versions-${line.id}-tab-${v.version}`}
            aria-selected={active}
            aria-controls={`versions-${line.id}-panel`}
            tabIndex={active ? 0 : -1}
            onClick={() => onSelect(v.version)}
            onKeyDown={(event) => onKeyDown(event, position)}
            className={cn(
              "inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-lg px-3.5 text-sm font-semibold whitespace-nowrap transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
              active ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:bg-card/60 hover:text-foreground",
            )}
          >
            {versionName(line, v.version)}
            {v.version === approvedVersion ? (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-success-soft px-1.5 py-0.5 text-[11px] text-success">
                <Check className="size-3" aria-hidden />
                Approved
              </span>
            ) : null}
          </button>
        );
      })}
    </div>
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

/** Approve artwork / Request changes, or the approval with Undo and the way on. */
function Decision({
  line,
  version,
  readOnly,
  busy,
  compact,
  onApprove,
  onUndo,
  onRequest,
  onShowVersion,
  next,
  approveButton,
  undoButton,
}: {
  line: Line;
  version: number;
  readOnly: boolean;
  busy: string | null;
  /** Phones: buttons side by side, no extra hint. */
  compact: boolean;
  onApprove: (version: number) => void;
  onUndo: () => void;
  onRequest: () => void;
  onShowVersion: (version: number) => void;
  next: NextStep;
  approveButton: RefObject<HTMLButtonElement | null>;
  undoButton: RefObject<HTMLButtonElement | null>;
}) {
  const approved = line.status === "APPROVED" && line.approved_version !== null ? line.approved_version : null;
  const approving = busy === `approve:${line.id}`;
  const undoing = busy === `undo:${line.id}`;
  const isLatest = version === line.current_version;
  const approvedHere = approved === version;

  const approvedBox =
    approved !== null ? (
      <div
        className={cn(
          "flex items-center justify-between gap-x-3 gap-y-2 rounded-xl border border-success/30 bg-success-soft px-3.5 py-2.5 text-success",
          !compact && "flex-wrap",
        )}
      >
        <p className="min-w-0 text-sm">
          <span className="flex items-center gap-1.5 font-semibold">
            <CircleCheck className="size-4 shrink-0" aria-hidden />
            You approved Version {approved}
          </span>
          {/* On phones the bar stays short; the time is in the item's history. */}
          {line.approved_at && !compact ? (
            <time dateTime={isoTime(line.approved_at)} className="mt-0.5 block text-xs">
              {formatTime(line.approved_at)}
            </time>
          ) : null}
          {/* Not when the approved one is the latest and this is an older one: "See the latest" below goes there. */}
          {!approvedHere && (readOnly || isLatest || approved !== line.current_version) ? (
            <Button variant="link" className="-ml-2 px-2 text-xs text-success" onClick={() => onShowVersion(approved)}>
              Show Version {approved}
            </Button>
          ) : null}
        </p>
        {!readOnly && line.undo_event_id !== null ? (
          <Button
            ref={undoButton}
            variant="outline"
            className="border-success/40 bg-card px-3.5"
            disabled={busy !== null}
            onClick={onUndo}
          >
            {undoing ? <Loader2 className="animate-spin" aria-hidden /> : <Undo2 aria-hidden />}
            {undoing ? "Undoing…" : "Undo"}
          </Button>
        ) : null}
      </div>
    ) : null;

  if (readOnly) {
    return (
      approvedBox ?? (
        <Callout icon={<Info className="size-4" aria-hidden />}>This item can&apos;t be changed any more.</Callout>
      )
    );
  }

  const short = approved === null && isLatest;
  // Side by side on phones (the main button on the right, where the thumb is), stacked with the main
  // one first otherwise. Side by side, a phone drops the icons so both labels stay on one line: a
  // 360 px screen leaves about 140 px per button.
  const sideBySide = compact && (short || (approvedHere && next !== null));
  const size = sideBySide ? "px-2.5 text-sm max-sm:[&_svg]:hidden" : compact ? "px-3 text-sm" : "";
  const requestButton = (
    <Button key="request" variant="outline" size="lg" className={cn("w-full", size)} disabled={busy !== null} onClick={onRequest}>
      <PencilLine aria-hidden />
      Request changes
    </Button>
  );
  const mainButton = approvedHere ? (
    next ? (
      <Button key="next" size="lg" className={cn("w-full", size)} onClick={next.go}>
        {next.back ? <LayoutGrid aria-hidden /> : null}
        {next.label}
        {next.back ? null : <ArrowRight aria-hidden />}
      </Button>
    ) : null
  ) : (
    // An older version is there to compare: approving it is possible, but never the main button.
    <Button
      key="approve"
      ref={approveButton}
      size="lg"
      variant={isLatest ? "default" : "outline"}
      className={cn("w-full", size)}
      disabled={busy !== null}
      onClick={() => onApprove(version)}
    >
      {approving ? <Loader2 className="animate-spin" aria-hidden /> : <Check aria-hidden />}
      {approving
        ? "Approving…"
        : short
          ? "Approve artwork"
          : isLatest
            ? `Approve Version ${version}`
            : `Approve Version ${version} instead`}
    </Button>
  );

  return (
    <div className="space-y-3">
      {approvedBox}

      {approved === null && line.status === "CHANGES_REQUESTED" ? (
        <Callout icon={<Info className="size-4" aria-hidden />}>
          You asked for changes, so we&apos;ll send you an updated version. If you&apos;d rather go ahead with this one as it
          is, you can still approve it.
        </Callout>
      ) : null}

      {!isLatest && !approvedHere ? (
        <Callout tone="waiting" icon={<Info className="size-4" aria-hidden />}>
          This is an older version.{" "}
          <button
            type="button"
            className="-my-3 rounded py-3 font-semibold text-primary-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onShowVersion(line.current_version)}
          >
            See the latest, Version {line.current_version}
          </button>
        </Callout>
      ) : null}

      <div className={cn("grid gap-2", sideBySide && "grid-cols-2")}>
        {sideBySide ? [requestButton, mainButton] : [mainButton, requestButton]}
      </div>
      {compact || approvedHere ? null : (
        <p className="text-xs leading-relaxed text-muted-foreground">
          Approving means we&apos;ll make this item exactly as shown. Not quite right? Choose Request changes and tell us
          what to change.
        </p>
      )}
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
              className="block size-14 overflow-hidden rounded-lg border border-border bg-surface p-0.5 transition hover:border-input focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Thumb key={art.url} src={art.url} alt="" className="rounded-md" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
