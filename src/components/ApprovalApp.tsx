"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Hero } from "@/components/Hero";
import { ItemsOverview } from "@/components/ItemsOverview";
import { EMPTY_DRAFT, RejectSheet, type RejectDraft } from "@/components/RejectSheet";
import { controlId, ReviewPanel, type LineActions, type NextStep } from "@/components/ReviewPanel";
import { ReviewSheet } from "@/components/ReviewSheet";
import { InvalidLinkScreen, LoadErrorScreen, LoadingScreen } from "@/components/Screens";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ApproveAll, ApproveAllSheet, StickyBar } from "@/components/SummaryBar";
import { Button } from "@/components/ui/button";
import { approvalApi, INVALID_LINK, type Result } from "@/lib/api";
import { firstToReview, lineTitle, nextToReview, versionName } from "@/lib/lines";
import { useIsWide } from "@/lib/media";
import type { Outcome } from "@/lib/outcome";
import { readToken, serverToken, subscribeToken } from "@/lib/token";
import { linesToApprove, type LastChoice, type Line, type PublicView } from "@/lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string; canRetry: boolean }
  | { kind: "ready"; view: PublicView };

/** The Reject box: the item it is for, and the version and last choice it recorded when it opened. */
type RejectBox = { lineId: number; version: number; lastChoiceId: number | null; open: boolean; opened: number };

// Coming back to the tab reloads the view, at most this often.
const REFRESH_GAP_MS = 5_000;
// For this long after an action on an item answers, that item's buttons ignore presses, so a double
// tap or a double Enter acts once (the second press would land on the button that took its place).
const QUIET_MS = 1_000;

function phaseOf(result: Result): Phase {
  if (result.ok) {
    return result.view
      ? { kind: "ready", view: result.view }
      : { kind: "error", message: "We couldn't read your artwork. Please try again.", canRetry: true };
  }
  switch (result.kind) {
    case "invalid":
      return { kind: "invalid", message: result.message };
    case "setup":
      return { kind: "error", message: result.message, canRetry: false };
    case "aborted":
      return { kind: "loading" };
    default:
      return { kind: "error", message: result.message || "Something went wrong. Please try again.", canRetry: true };
  }
}

/** What Undo took back, read out by the choice the page showed. */
function undoneText(choice: LastChoice | null, title: string): string {
  if (!choice) return `You undid your last choice on ${title}.`;
  const version = versionName(choice.version);
  if (choice.kind === "WENT_BACK") return `You undid going back to ${version} of ${title}.`;
  if (choice.kind === "REJECTED") return `You undid your rejection of ${version} of ${title}.`;
  return `You undid your approval of ${version} of ${title}.`;
}

/**
 * The whole approval page. It reads the link's key from the address (#…), loads the view, and
 * sends every customer action. Every write answers with the new view (or a 409 that carries
 * it), so the page always shows what the API holds.
 *
 * Layout: a summary at the top, then every item as a card. On wide screens the cards sit in a
 * list beside the review of the chosen item; on phones they form a grid, with Approve all after
 * it, and the review opens full screen. An order with one item goes straight to its review.
 */
export default function ApprovalApp() {
  // undefined until the browser has read the address, null when there's no valid key.
  const token = useSyncExternalStore(subscribeToken, readToken, serverToken);
  const wide = useIsWide();
  const [loaded, setLoaded] = useState<{ token: string; phase: Phase } | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const [announcement, setAnnouncement] = useState("");
  // The Approve all sheet, with the page as it was when the sheet opened.
  const [confirmAll, setConfirmAll] = useState<{ open: boolean; view: PublicView } | null>(null);
  const [rejectBox, setRejectBox] = useState<RejectBox | null>(null);
  // What the customer typed and picked in each item's Reject box, for this link. In memory only:
  // closing the box or a refused Submit keeps it; only a Submit that goes through clears it.
  const [drafts, setDrafts] = useState<{ token: string | null; byLine: Record<number, RejectDraft> }>({ token: null, byLine: {} });
  const [refreshFailed, setRefreshFailed] = useState(false);
  // The item under review. Chosen when the view first loads (the first one waiting), so
  // approving it doesn't move the page on to another item by itself.
  const [picked, setPicked] = useState<{ token: string; id: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [summaryInView, setSummaryInView] = useState(true);
  const [approveAllInView, setApproveAllInView] = useState(false);
  // The items (and "batch" for Approve all) whose buttons are pausing after an action answered.
  const [paused, setPaused] = useState<ReadonlySet<string>>(new Set());

  const phase: Phase =
    token === undefined
      ? { kind: "loading" }
      : token === null
        ? { kind: "invalid", message: "" }
        : loaded?.token === token
          ? loaded.phase
          : { kind: "loading" };
  // While a box is open the page doesn't reload the view: choosing pictures leaves the page and comes back.
  const boxOpen = Boolean(confirmAll?.open || rejectBox?.open);

  const tokenRef = useRef<string | null | undefined>(undefined);
  const phaseRef = useRef<Phase["kind"]>("loading");
  const boxOpenRef = useRef(false);
  const busyRef = useRef(false);
  // Counts writes, so a view requested before a write can't replace the write's answer.
  const writes = useRef(0);
  const lastLoad = useRef(0);
  // Whether closing a box gives focus back to the button that opened it (Cancel, Escape) or not
  // (the page moves focus itself after an answer). Radix only does it for its own Trigger, which
  // these boxes don't use, so the page remembers the opener.
  const rejectReturnsFocus = useRef(true);
  const confirmReturnsFocus = useRef(true);
  const opener = useRef<HTMLElement | null>(null);
  useEffect(() => {
    tokenRef.current = token;
    phaseRef.current = phase.kind;
    boxOpenRef.current = boxOpen;
  });

  // The first load, Try again, and another link pasted into the same tab. GETs never change anything.
  useEffect(() => {
    if (!token) return;
    const controller = new AbortController();
    approvalApi
      .view(token, controller.signal)
      .then((result) => {
        if (!result.ok && result.kind === "aborted") return;
        lastLoad.current = Date.now();
        setLoaded({ token, phase: phaseOf(result) });
        const first = result.ok && result.view ? firstToReview(result.view) : null;
        if (first !== null) setPicked((current) => (current?.token === token ? current : { token, id: first }));
        // Another link starts on its list, not inside the previous link's review or boxes.
        setSheetOpen(false);
        setRejectBox(null);
        setConfirmAll(null);
      })
      // Never leave the customer on "Loading…": anything unexpected becomes the Try again screen.
      .catch(() =>
        setLoaded({ token, phase: { kind: "error", message: "Something went wrong. Please try again.", canRetry: true } }),
      );
    return () => controller.abort();
  }, [token, attempt]);

  // Every newer view after the first load comes through here.
  const showView = useCallback((forToken: string, view: PublicView) => {
    if (tokenRef.current !== forToken) return;
    lastLoad.current = Date.now();
    setRefreshFailed(false);
    // Fewer than two items left waiting (another device approved them): the Approve all sheet closes.
    if (linesToApprove(view).length < 2) setConfirmAll((sheet) => (sheet?.open ? { ...sheet, open: false } : sheet));
    setLoaded({ token: forToken, phase: { kind: "ready", view } });
  }, []);

  // Reloads the view when the customer comes back to the tab, unless an action runs or a box is open.
  const refresh = useCallback(async (force = false) => {
    const current = tokenRef.current;
    if (!current || busyRef.current || boxOpenRef.current) return;
    if (!force && Date.now() - lastLoad.current < REFRESH_GAP_MS) return;
    if (phaseRef.current === "error") {
      setAttempt((n) => n + 1);
      return;
    }
    if (phaseRef.current !== "ready") return;
    const before = writes.current;
    lastLoad.current = Date.now();
    const result = await approvalApi.view(current);
    if (writes.current !== before || tokenRef.current !== current) return;
    // A box opened while the view was on its way: leave the page as the box found it, and let the
    // next return to the tab load again.
    if (boxOpenRef.current) {
      lastLoad.current = 0;
      return;
    }
    if (result.ok && result.view) {
      showView(current, result.view);
    } else if (!result.ok && result.kind === "invalid") {
      setLoaded({ token: current, phase: { kind: "invalid", message: result.message } });
    } else {
      setRefreshFailed(true);
    }
  }, [showView]);

  useEffect(() => {
    const onFocus = () => void refresh();
    const onVisible = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [refresh]);

  // The slim bar at the top appears once the summary has scrolled away.
  const watchSummary = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setSummaryInView(entry.isIntersecting));
    observer.observe(node);
    return () => observer.disconnect();
  }, []);
  // On phones Approve all sits under the items; while it's on screen the slim bar leaves out its own copy.
  const watchApproveAll = useCallback((node: HTMLDivElement | null) => {
    if (!node) return;
    const observer = new IntersectionObserver(([entry]) => setApproveAllInView(entry.isIntersecting));
    observer.observe(node);
    return () => {
      observer.disconnect();
      setApproveAllInView(false);
    };
  }, []);

  // On wide screens, choosing an item moves focus to its review (and scrolls it into view when
  // needed). Counted, so choosing the same item again still does it.
  const reviewHeading = useRef<HTMLHeadingElement>(null);
  const [reveals, setReveals] = useState(0);
  useEffect(() => {
    const heading = reviewHeading.current;
    const panel = heading?.closest("article");
    if (reveals === 0 || !heading || !panel) return;
    heading.focus({ preventScroll: true });
    const top = panel.getBoundingClientRect().top;
    if (top < 64 || top > window.innerHeight * 0.6) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      panel.scrollIntoView({ block: "start", behavior: smooth ? "smooth" : "auto" });
    }
  }, [reveals]);

  // Where focus goes once the page shows an action's answer: the first of these elements that is
  // on the page (an item's panel may have been drawn anew). It waits while a box is still open,
  // and is dropped when nothing fits within a few seconds.
  const focusWanted = useRef<{ ids: string[]; until: number } | null>(null);
  const [, setFocusRequests] = useState(0);
  const focusLater = (ids: string[]) => {
    focusWanted.current = { ids, until: Date.now() + 3_000 };
    setFocusRequests((n) => n + 1);
  };
  useEffect(() => {
    const want = focusWanted.current;
    if (!want || boxOpen) return;
    const target = want.ids.map((id) => document.getElementById(id)).find((el) => el !== null);
    if (target || Date.now() > want.until) focusWanted.current = null;
    target?.focus();
  });

  // A tap doesn't focus a button in every browser, so the opener's id is the fallback.
  const rememberOpener = () => {
    opener.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  };
  const focusOpener = (fallbackId: string) => {
    const back = opener.current?.isConnected ? opener.current : document.getElementById(fallbackId);
    back?.focus();
  };

  const quiet = (key: string) => paused.has(key);
  const pause = (key: string) => {
    setPaused((keys) => new Set(keys).add(key));
    setTimeout(
      () =>
        setPaused((keys) => {
          const rest = new Set(keys);
          rest.delete(key);
          return rest;
        }),
      QUIET_MS,
    );
  };

  // The same text twice in a row is still read out.
  const announce = (message: string) => setAnnouncement((previous) => (previous === message ? `${message} ` : message));

  /**
   * Runs one write. One at a time: a second tap while one is running does nothing. `quiet` names
   * the buttons that pause for a moment once it answers; `focusDone` and `focusConflict` where focus
   * goes after a success or a 409.
   */
  const run = async (
    key: string,
    send: (token: string) => Promise<Result>,
    done: string | ((view: PublicView | null) => string),
    options: { inlineErrors?: boolean; quiet?: string; focusDone?: string[]; focusConflict?: string[] } = {},
  ): Promise<Outcome> => {
    const current = tokenRef.current;
    if (!current || busyRef.current) return { status: "skipped" };
    busyRef.current = true;
    writes.current += 1;
    setBusy(key);
    // An answer without a view (it shouldn't happen) is followed by a fresh load.
    const viewAfter = async (view: PublicView | null) => {
      const fresh = view ?? (await approvalApi.view(current).then((r) => (r.ok ? r.view : null)));
      if (fresh) showView(current, fresh);
      return fresh;
    };
    try {
      const result = await send(current);
      if (options.quiet) pause(options.quiet);
      if (result.ok) {
        const fresh = await viewAfter(result.view);
        announce(typeof done === "string" ? done : done(fresh));
        if (options.focusDone) focusLater(options.focusDone);
        return { status: "done" };
      }
      switch (result.kind) {
        case "conflict":
          await viewAfter(result.view);
          if (result.code === "READ_ONLY") {
            toast.info("This order can't be changed any more.");
          } else {
            toast.info("This was just updated", { description: "We've loaded the latest version. Please check it and try again." });
          }
          if (options.focusConflict) focusLater(options.focusConflict);
          return { status: "conflict" };
        case "invalid":
          setLoaded({ token: current, phase: { kind: "invalid", message: result.message } });
          return { status: "failed", message: result.message };
        case "aborted":
          return { status: "skipped" };
        default:
          if (!options.inlineErrors) {
            const canRetry = result.kind === "network" || result.kind === "server";
            toast.error(
              result.message,
              canRetry ? { action: { label: "Retry", onClick: () => void run(key, send, done, options) } } : undefined,
            );
          }
          return { status: "failed", message: result.message };
      }
    } finally {
      busyRef.current = false;
      setBusy(null);
    }
  };

  const item = (line: Line) => `line:${line.id}`;
  const draftOf = (lineId: number) => (drafts.token === token ? drafts.byLine[lineId] : undefined) ?? EMPTY_DRAFT;
  const saveDraft = (lineId: number, draft: RejectDraft | null) =>
    setDrafts((current) => {
      const byLine = current.token === token ? { ...current.byLine } : {};
      if (draft) byLine[lineId] = draft;
      else delete byLine[lineId];
      return { token: token ?? null, byLine };
    });
  const closeReject = (returnFocus: boolean) => {
    rejectReturnsFocus.current = returnFocus;
    setRejectBox((box) => (box ? { ...box, open: false } : box));
  };
  // Sends exactly what the box recorded when it opened. A 409 closes it (the page shows what
  // changed) and keeps the draft; any other refusal is shown in the box, which stays open.
  const submitReject = async (box: RejectBox, line: Line, form: FormData): Promise<Outcome> => {
    const outcome = await run(
      `reject:${line.id}`,
      (t) => approvalApi.reject(t, line.id, form),
      `You rejected ${versionName(box.version)} of ${lineTitle(line)}.`,
      { inlineErrors: true, quiet: item(line), focusDone: [controlId("undo", line.id)], focusConflict: [controlId("heading", line.id)] },
    );
    if (outcome.status === "done") {
      toast.success(`${versionName(box.version)} rejected`, { description: "Thanks! We'll send you a new version to check." });
      saveDraft(line.id, null);
      closeReject(false);
    } else if (outcome.status === "conflict") {
      closeReject(false);
    }
    return outcome;
  };

  if (phase.kind !== "ready") {
    return (
      <Shell>
        {phase.kind === "loading" ? (
          <LoadingScreen />
        ) : phase.kind === "invalid" ? (
          <InvalidLinkScreen missing={token === null} message={phase.message || INVALID_LINK} />
        ) : (
          <LoadErrorScreen
            message={phase.message}
            canRetry={phase.canRetry}
            onRetry={() => {
              setLoaded(null);
              setAttempt((n) => n + 1);
            }}
          />
        )}
      </Shell>
    );
  }

  const { view } = phase;
  const { lines } = view;
  const readOnly = view.state.read_only;
  const pickedId = picked && picked.token === token ? picked.id : null;
  const selectedId = pickedId !== null && lines.some((line) => line.id === pickedId) ? pickedId : firstToReview(view);
  const selectedIndex = lines.findIndex((line) => line.id === selectedId);
  const selected = lines[selectedIndex] ?? null;
  const rejectLine = rejectBox ? lines.find((line) => line.id === rejectBox.lineId) : undefined;

  const openApproveAll = () => {
    if (quiet("batch") || busyRef.current) return;
    confirmReturnsFocus.current = true;
    rememberOpener();
    setConfirmAll({ open: true, view });
  };
  const approveAll = async (chosen: Line[]) => {
    const outcome = await run(
      "approve-all",
      (t) => approvalApi.approveAll(t, chosen.map((line) => ({ id: line.id, latest: line.current_version }))),
      (fresh) => {
        const size = fresh?.last_batch?.size || chosen.length;
        return size === 1 ? "1 item approved." : `${size} items approved.`;
      },
      { quiet: "batch", focusDone: ["batch-outcome"] },
    );
    if (outcome.status === "done") confirmReturnsFocus.current = false;
    if (outcome.status === "done" || outcome.status === "conflict") setConfirmAll((sheet) => (sheet ? { ...sheet, open: false } : sheet));
  };
  const undoApproveAll = () => {
    const batch = view.last_batch;
    if (!batch?.undoable || quiet("batch")) return;
    void run("undo-all", (t) => approvalApi.undo(t, { batch_id: batch.batch_id }), "Approve all undone.", {
      quiet: "batch",
      focusDone: ["approve-all"],
    });
  };
  // Approve all is for two or more items waiting, while things can still change. Wide screens show
  // it in the summary; phones and tablets after the items, so the artwork comes first.
  const waiting = linesToApprove(view).length;
  const approveAllBox =
    !readOnly && (waiting >= 2 || view.last_batch?.undoable) ? (
      <ApproveAll view={view} busy={busy} onApprove={openApproveAll} onUndo={undoApproveAll} />
    ) : null;
  const slimApproveAll =
    !readOnly && waiting >= 2 && !approveAllInView ? (
      <ApproveAll view={view} busy={busy} compact onApprove={openApproveAll} onUndo={undoApproveAll} />
    ) : null;
  const bottomApproveAll = wide ? null : approveAllBox;

  const goTo = (id: number) => {
    if (!token) return;
    setPicked({ token, id });
    if (wide) {
      setReveals((n) => n + 1);
    } else {
      setSheetOpen(true);
      const index = lines.findIndex((line) => line.id === id);
      if (index >= 0) announce(`Item ${index + 1} of ${lines.length}: ${lineTitle(lines[index])}`);
    }
  };
  const step = (by: number) => {
    const target = lines[selectedIndex + by];
    return target ? () => goTo(target.id) : null;
  };
  const nextStep = (line: Line): NextStep => {
    const following = nextToReview(lines, line.id);
    if (following) return { label: "Next item", to: following.id };
    return wide ? null : { label: "All items", to: null };
  };
  // A new version opens the item afresh, on the newest version.
  const panelKey = (line: Line) => `${line.id}:${line.current_version}`;

  const actions: LineActions = {
    // Approve (the newest version) or Go back (an older one), with the version and last choice the page showed.
    approve: (line, version) => {
      if (quiet(item(line))) return;
      const title = lineTitle(line);
      const back = version < line.current_version;
      void run(
        `${back ? "go-back" : "approve"}:${line.id}`,
        (t) => approvalApi.approve(t, line.id, version, line.current_version, line.last_choice?.event_id ?? null),
        back ? `You went back to ${versionName(version)} of ${title}.` : `You approved ${versionName(version)} of ${title}.`,
        { quiet: item(line), focusDone: [controlId("undo", line.id)], focusConflict: [controlId("heading", line.id)] },
      );
    },
    // Opens the Reject box, which records the newest version and the last choice as they are now.
    reject: (line) => {
      if (quiet(item(line)) || busyRef.current) return;
      rejectReturnsFocus.current = true;
      rememberOpener();
      setRejectBox((box) => ({
        lineId: line.id,
        version: line.current_version,
        lastChoiceId: line.last_choice?.event_id ?? null,
        open: true,
        opened: (box?.opened ?? 0) + 1,
      }));
    },
    undo: (line) => {
      const eventId = line.undo_event_id ?? line.last_choice?.event_id ?? null;
      if (eventId === null || quiet(item(line))) return;
      void run(`undo:${line.id}`, (t) => approvalApi.undo(t, { event_id: eventId }), undoneText(line.last_choice, lineTitle(line)), {
        quiet: item(line),
        // Never onto another Undo: Approve when the newest is waiting again, else Go back, else the outcome's words.
        focusDone: [controlId("approve", line.id), controlId("go-back", line.id), controlId("outcome", line.id)],
        focusConflict: [controlId("heading", line.id)],
      });
    },
    // It pauses with the item's other buttons, so a double tap on Approve doesn't skip an item.
    next: (line, to) => {
      if (quiet(item(line))) return;
      if (to === null) setSheetOpen(false);
      else goTo(to);
    },
  };

  return (
    <Shell supportEmail={view.support_email} order>
      <StickyBar view={view} visible={!summaryInView && !sheetOpen} approveAll={slimApproveAll} />
      <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 px-4 py-5 sm:px-6 lg:py-6">
        <Hero view={view} progressRef={watchSummary} approveAll={wide ? approveAllBox : null} />
        {refreshFailed ? (
          <div
            role="status"
            className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-input bg-muted px-4 py-2.5 text-sm"
          >
            We couldn&apos;t check for updates. What you see may be out of date.
            <Button variant="outline" onClick={() => void refresh(true)}>
              <RefreshCw aria-hidden />
              Try again
            </Button>
          </div>
        ) : null}

        {lines.length === 0 || !selected ? (
          <p className="rounded-2xl border border-border/70 bg-card p-5 text-sm text-muted-foreground">
            There&apos;s nothing to review on this order yet.
          </p>
        ) : lines.length === 1 ? (
          <ReviewPanel
            key={panelKey(selected)}
            line={selected}
            readOnly={readOnly}
            busy={busy}
            paused={quiet(item(selected))}
            actions={actions}
            layout={wide ? "split" : "stack"}
            next={null}
          />
        ) : wide ? (
          <div className="grid grid-cols-[320px_minmax(0,1fr)] items-start gap-6 xl:grid-cols-[360px_minmax(0,1fr)] xl:gap-8">
            <div className="sticky top-20 -m-1 max-h-[calc(100dvh-6rem)] overflow-y-auto p-1">
              <ItemsOverview lines={lines} readOnly={readOnly} selectedId={selected.id} layout="list" onSelect={goTo} />
            </div>
            <div className="scroll-mt-20">
              <ReviewPanel
                key={panelKey(selected)}
                line={selected}
                position={{ index: selectedIndex + 1, total: lines.length }}
                readOnly={readOnly}
                busy={busy}
                paused={quiet(item(selected))}
                actions={actions}
                layout="split"
                nav={{ previous: step(-1), next: step(1) }}
                next={nextStep(selected)}
                headingRef={reviewHeading}
              />
            </div>
          </div>
        ) : (
          <>
            <ItemsOverview lines={lines} readOnly={readOnly} selectedId={null} layout="grid" onSelect={goTo} />
            {bottomApproveAll ? (
              <div ref={watchApproveAll} className="sm:max-w-sm">
                {bottomApproveAll}
              </div>
            ) : null}
            <ReviewSheet
              open={sheetOpen}
              onOpenChange={setSheetOpen}
              title={lineTitle(selected)}
              position={{ index: selectedIndex + 1, total: lines.length }}
              onPrevious={step(-1)}
              onNext={step(1)}
            >
              <ReviewPanel
                key={panelKey(selected)}
                line={selected}
                readOnly={readOnly}
                busy={busy}
                paused={quiet(item(selected))}
                actions={actions}
                layout="stack"
                framed={false}
                next={nextStep(selected)}
              />
            </ReviewSheet>
          </>
        )}
      </main>
      {confirmAll ? (
        <ApproveAllSheet
          view={confirmAll.view}
          open={confirmAll.open}
          busy={busy}
          onOpenChange={(open) => setConfirmAll((sheet) => (sheet ? { ...sheet, open } : sheet))}
          onConfirm={approveAll}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (confirmReturnsFocus.current) focusOpener("approve-all");
          }}
        />
      ) : null}
      {rejectBox && rejectLine ? (
        <RejectSheet
          key={rejectBox.opened}
          open={rejectBox.open}
          onOpenChange={(open) => {
            if (!open) closeReject(true);
          }}
          itemTitle={lineTitle(rejectLine)}
          version={rejectBox.version}
          lastChoiceId={rejectBox.lastChoiceId}
          draft={draftOf(rejectBox.lineId)}
          onDraftChange={(draft) => saveDraft(rejectBox.lineId, draft)}
          sending={busy === `reject:${rejectBox.lineId}`}
          disabled={busy !== null}
          onSubmit={(form) => submitReject(rejectBox, rejectLine, form)}
          onCloseAutoFocus={(event) => {
            event.preventDefault();
            if (rejectReturnsFocus.current) focusOpener(controlId("reject", rejectBox.lineId));
          }}
        />
      ) : null}
      <p className="sr-only" role="status" aria-live="polite">
        {announcement}
      </p>
    </Shell>
  );
}

function Shell({ supportEmail, order = false, children }: { supportEmail?: string | null; order?: boolean; children: ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      {children}
      <SiteFooter supportEmail={supportEmail} order={order} />
    </div>
  );
}
