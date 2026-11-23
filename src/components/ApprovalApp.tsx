"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { Hero } from "@/components/Hero";
import { ItemsOverview } from "@/components/ItemsOverview";
import { ReviewPanel, type LineActions, type NextStep } from "@/components/ReviewPanel";
import { ReviewSheet } from "@/components/ReviewSheet";
import { InvalidLinkScreen, LoadErrorScreen, LoadingScreen } from "@/components/Screens";
import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { ApproveAllSheet, ApproveAllToggle, StickyBar } from "@/components/SummaryBar";
import { Button } from "@/components/ui/button";
import { approvalApi, INVALID_LINK, type Result } from "@/lib/api";
import { firstToReview, lineTitle, nextToReview } from "@/lib/lines";
import { useIsWide } from "@/lib/media";
import type { Outcome } from "@/lib/outcome";
import { readToken, serverToken, subscribeToken } from "@/lib/token";
import { isSent, linesToApprove, type Line, type PublicView } from "@/lib/types";

type Phase =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "error"; message: string; canRetry: boolean }
  | { kind: "ready"; view: PublicView };

// Coming back to the tab reloads the view, at most this often.
const REFRESH_GAP_MS = 5_000;

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
  const [confirmAll, setConfirmAll] = useState(false);
  const [undoHint, setUndoHint] = useState(false);
  const [refreshFailed, setRefreshFailed] = useState(false);
  // The item under review. Chosen when the view first loads (the first one waiting), so
  // approving it doesn't move the page on to another item by itself.
  const [picked, setPicked] = useState<{ token: string; id: number } | null>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [summaryInView, setSummaryInView] = useState(true);
  const [approveAllInView, setApproveAllInView] = useState(false);

  const phase: Phase =
    token === undefined
      ? { kind: "loading" }
      : token === null
        ? { kind: "invalid", message: "" }
        : loaded?.token === token
          ? loaded.phase
          : { kind: "loading" };

  const tokenRef = useRef<string | null | undefined>(undefined);
  const phaseRef = useRef<Phase["kind"]>("loading");
  const busyRef = useRef(false);
  // Counts writes, so a view requested before a write can't replace the write's answer.
  const writes = useRef(0);
  const lastLoad = useRef(0);
  useEffect(() => {
    tokenRef.current = token;
    phaseRef.current = phase.kind;
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
        // Another link starts on its list, not inside the previous link's review.
        setSheetOpen(false);
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
    // Nothing left for Approve all (another device approved it): its sheet closes.
    if (linesToApprove(view).length === 0) setConfirmAll(false);
    setLoaded({ token: forToken, phase: { kind: "ready", view } });
  }, []);

  // Reloads the view when the customer comes back to the tab, unless an action is running.
  const refresh = useCallback(async (force = false) => {
    const current = tokenRef.current;
    if (!current || busyRef.current) return;
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

  // The same text twice in a row is still read out.
  const announce = (message: string) => setAnnouncement((previous) => (previous === message ? `${message} ` : message));

  /** Runs one write. One at a time: a second tap while one is running does nothing. */
  const run = async (
    key: string,
    send: (token: string) => Promise<Result>,
    done: string,
    options: { inlineErrors?: boolean } = {},
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
    };
    try {
      const result = await send(current);
      if (result.ok) {
        await viewAfter(result.view);
        announce(done);
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

  const actions: LineActions = {
    approve: (line, version) =>
      run(
        `approve:${line.id}`,
        (t) => approvalApi.approve(t, line.id, version, line.current_version),
        `Approved Version ${version} of ${lineTitle(line)}.`,
      ),
    undo: (line) => {
      const eventId = line.undo_event_id;
      if (eventId === null) return Promise.resolve({ status: "skipped" });
      return run(`undo:${line.id}`, (t) => approvalApi.undo(t, { event_id: eventId }), `Your approval of ${lineTitle(line)} is undone.`);
    },
    addNote: async (line, form) => {
      // A note on an approved item that keeps the approval is just a note; anything else asks for changes.
      const keeps = line.status === "APPROVED" && form.get("undo_approval") !== "true";
      const outcome = await run(
        `add-note:${line.id}`,
        (t) => approvalApi.addNote(t, line.id, form),
        `Your note about ${lineTitle(line)} was sent.`,
        { inlineErrors: true },
      );
      if (outcome.status === "done") {
        if (keeps) toast.success("Note sent", { description: "Thanks! The item stays approved." });
        else toast.success("Request sent", { description: "We'll make the changes and send you an updated version to approve." });
      }
      return outcome;
    },
    toggleNote: (note) =>
      run(
        `note:${note.event_id}`,
        (t) => (note.removed ? approvalApi.restoreNote(t, note.event_id) : approvalApi.removeNote(t, note.event_id)),
        note.removed ? "Note restored." : "Note removed.",
      ),
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

  const approveAll = async (chosen: Line[]) => {
    const outcome = await run(
      "approve-all",
      (t) => approvalApi.approveAll(t, chosen.map((line) => ({ id: line.id, latest: line.current_version }))),
      chosen.length === 1 ? "1 item approved." : `${chosen.length} items approved.`,
    );
    if (outcome.status === "done" || outcome.status === "conflict") setConfirmAll(false);
  };
  const untick = () => {
    const batch = view.last_batch;
    if (batch?.undoable) {
      setUndoHint(false);
      void run("undo-all", (t) => approvalApi.undo(t, { batch_id: batch.batch_id }), "Approve all undone.");
    } else {
      setUndoHint(true);
    }
  };
  // One item has its own Approve button; Approve all is for two or more, while things can still change.
  // Wide screens show it in the summary; phones and tablets after the items, so the artwork comes first.
  const approveAllBox = (compact: boolean) =>
    !readOnly && lines.filter(isSent).length > 1 ? (
      <ApproveAllToggle
        view={view}
        busy={busy}
        showUndoHint={undoHint}
        compact={compact}
        onTick={() => {
          setUndoHint(false);
          setConfirmAll(true);
        }}
        onUntick={untick}
      />
    ) : null;
  const bottomApproveAll = wide ? null : approveAllBox(false);

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
    if (following) return { label: "Next item", go: () => goTo(following.id) };
    return wide ? null : { label: "All items", go: () => setSheetOpen(false), back: true };
  };

  return (
    <Shell supportEmail={view.support_email} order>
      <StickyBar view={view} visible={!summaryInView && !sheetOpen} approveAll={approveAllInView ? null : approveAllBox(true)} />
      <main className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 px-4 py-5 sm:px-6 lg:py-6">
        <Hero view={view} progressRef={watchSummary} approveAll={wide ? approveAllBox(false) : null} />
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
            key={selected.id}
            line={selected}
            readOnly={readOnly}
            busy={busy}
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
                key={selected.id}
                line={selected}
                position={{ index: selectedIndex + 1, total: lines.length }}
                readOnly={readOnly}
                busy={busy}
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
                key={selected.id}
                line={selected}
                readOnly={readOnly}
                busy={busy}
                actions={actions}
                layout="stack"
                framed={false}
                next={nextStep(selected)}
              />
            </ReviewSheet>
          </>
        )}
      </main>
      <ApproveAllSheet view={view} open={confirmAll} busy={busy} onOpenChange={setConfirmAll} onConfirm={approveAll} />
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
