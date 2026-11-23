// Calls to the backend's public approval API (/api/v1/approval). The token travels in
// the X-Approval-Token header only, never in a URL. Plain fetch: no cookies, no cache.
import { API_URL } from "./config";
import type { ApprovalStatus, Line, LineStatus, Note, ProofFile, PublicView, ReadOnlyReason, Version } from "./types";

export const INVALID_LINK = "This link isn't valid any more. Please ask us for a new one.";
const NETWORK = "We couldn't reach our server. Check your internet connection and try again.";
const TIMEOUT = "Our server took too long to answer. Please try again.";
const SERVER = "Something went wrong on our side. Please try again.";
const TOO_MANY = "Too many requests from your network. Please wait a few minutes and try again.";
const TOO_LARGE = "That was too large to send. Each picture can be up to 10 MB.";

type Failure =
  /** 404: unknown, replaced or switched-off link. */
  | { kind: "invalid"; message: string }
  /** 409: the page was out of date (STALE), the order can't change any more (READ_ONLY) or another conflict. */
  | { kind: "conflict"; code: string | null; message: string; view: PublicView | null }
  /** Other 4xx: the request itself was refused, with a message written for people. */
  | { kind: "rejected"; status: number; message: string }
  | { kind: "server"; status: number; message: string }
  | { kind: "network"; message: string }
  /** The site was built without NEXT_PUBLIC_API_URL. */
  | { kind: "setup"; message: string }
  /** Cancelled by the page itself (a newer request replaced it). */
  | { kind: "aborted" };

/** On success `view` is the new page state when the API sent one, otherwise null (load it again). */
export type Result = { ok: true; view: PublicView | null } | ({ ok: false } & Failure);

type CallOptions = { json?: unknown; form?: FormData; signal?: AbortSignal; timeout?: number };

async function call(token: string, path: string, method: "GET" | "POST", options: CallOptions = {}): Promise<Result> {
  if (!API_URL) {
    return { ok: false, kind: "setup", message: "This page isn't set up yet: the address of the API is missing." };
  }
  const headers: Record<string, string> = { "X-Approval-Token": token, Accept: "application/json" };
  let body: BodyInit | undefined;
  if (options.form) {
    body = options.form; // the browser sets the multipart boundary
  } else if (options.json !== undefined) {
    headers["Content-Type"] = "application/json";
    body = JSON.stringify(options.json);
  }

  // One controller for the caller's cancel and the timeout (AbortSignal.any is too new for older iPhones).
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeout ?? 30_000);
  const cancel = () => controller.abort();
  options.signal?.addEventListener("abort", cancel, { once: true });

  try {
    let res: Response;
    try {
      res = await fetch(`${API_URL}approval${path}`, {
        method,
        headers,
        body,
        cache: "no-store",
        credentials: "omit",
        referrerPolicy: "no-referrer",
        signal: controller.signal,
      });
    } catch {
      if (options.signal?.aborted) return { ok: false, kind: "aborted" };
      return { ok: false, kind: "network", message: timedOut ? TIMEOUT : NETWORK };
    }

    const payload = record(await res.json().catch(() => null));
    const message = typeof payload.message === "string" && payload.message.trim() ? payload.message.trim() : "";

    if (res.ok) {
      if (options.signal?.aborted) return { ok: false, kind: "aborted" };
      // A write whose answer couldn't be read may still have worked: the caller loads the view again.
      return { ok: true, view: toView(payload.data) };
    }
    if (res.status === 404) return { ok: false, kind: "invalid", message: message || INVALID_LINK };
    if (res.status === 409) {
      const data = record(payload.data);
      const code = typeof data.code === "string" ? data.code : null;
      return { ok: false, kind: "conflict", code, message, view: toView(data.view) };
    }
    if (res.status === 429) return { ok: false, kind: "rejected", status: 429, message: message || TOO_MANY };
    // Apache or Cloudflare can refuse a large upload before the API sees it, without a JSON body.
    if (res.status === 413) return { ok: false, kind: "rejected", status: 413, message: message || TOO_LARGE };
    if (res.status >= 400 && res.status < 500) {
      return { ok: false, kind: "rejected", status: res.status, message: message || SERVER };
    }
    return { ok: false, kind: "server", status: res.status, message: message || SERVER };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener("abort", cancel);
  }
}

const id = (value: number) => encodeURIComponent(String(value));

export const approvalApi = {
  view: (token: string, signal?: AbortSignal) => call(token, "", "GET", { signal }),
  approve: (token: string, lineId: number, version: number, latest: number) =>
    call(token, `/lines/${id(lineId)}/approve`, "POST", { json: { version, latest } }),
  approveAll: (token: string, lines: { id: number; latest: number }[]) =>
    call(token, "/approve-all", "POST", { json: { lines } }),
  undo: (token: string, target: { event_id: number } | { batch_id: string }) =>
    call(token, "/undo", "POST", { json: target }),
  // Up to five 10 MB pictures from a phone can take a while.
  addNote: (token: string, lineId: number, form: FormData) =>
    call(token, `/lines/${id(lineId)}/notes`, "POST", { form, timeout: 600_000 }),
  removeNote: (token: string, eventId: number) => call(token, `/notes/${id(eventId)}/remove`, "POST"),
  restoreNote: (token: string, eventId: number) => call(token, `/notes/${id(eventId)}/restore`, "POST"),
};

// ---------------------------------------------------------------------------
// Reading the view. The API's shape is in CONTRACT section 5; this reads it
// defensively (ids may arrive as strings from BIGINT columns, lists may be
// missing) so one odd field can't blank the customer's page.
// ---------------------------------------------------------------------------

type Raw = Record<string, unknown>;
const record = (v: unknown): Raw => (typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Raw) : {});
const array = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const text = (v: unknown): string | null => (typeof v === "string" ? v : typeof v === "number" ? String(v) : null);
const flag = (v: unknown) => v === true || v === 1 || v === "1" || v === "true";
const int = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" && /^-?\d+$/.test(v.trim()) ? Number(v) : NaN;
  return Number.isSafeInteger(n) ? n : null;
};
const texts = (v: unknown): string[] =>
  (typeof v === "string" ? [v] : array(v).map(text)).filter((s): s is string => !!s && !!s.trim());
const oneOf = <T extends string>(v: unknown, allowed: readonly T[]): T | null =>
  allowed.includes(v as T) ? (v as T) : null;

/** File addresses may be relative to the API's server (/approvals/…); only http(s) addresses are shown. */
function fileUrl(value: unknown): string {
  const raw = text(value)?.trim();
  if (!raw || !API_URL) return "";
  try {
    const url = new URL(raw, new URL("/", API_URL));
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : "";
  } catch {
    return "";
  }
}

const LINE_STATUSES = ["NOT_SENT", "NO_PROOF_NEEDED", "WAITING", "CHANGES_REQUESTED", "APPROVED"] as const;
const APPROVAL_STATUSES = ["DRAFT", "WAITING", "CHANGES_REQUESTED", "APPROVED"] as const;
const REASONS = ["LOCKED", "SHIPPED", "CANCELLED"] as const;

function toFile(raw: unknown): ProofFile | null {
  const f = record(raw);
  const fileId = int(f.id);
  const url = fileUrl(f.url);
  if (fileId === null || !url) return null;
  return { id: fileId, url, preview_url: fileUrl(f.preview_url) || null, name: text(f.name) ?? "", mime: text(f.mime) ?? "" };
}

function toVersion(raw: unknown): Version | null {
  const v = record(raw);
  const version = int(v.version);
  if (version === null || version < 1) return null;
  return {
    version,
    sent_at: text(v.sent_at),
    message: text(v.message),
    files: array(v.files).map(toFile).filter((f): f is ProofFile => f !== null),
  };
}

function toNote(raw: unknown): Note | null {
  const n = record(raw);
  const eventId = int(n.event_id);
  if (eventId === null) return null;
  return {
    event_id: eventId,
    body: text(n.body),
    created_at: text(n.created_at),
    version: int(n.version),
    file_id: int(n.file_id),
    removed: flag(n.removed),
    pictures: array(n.pictures)
      .map((p) => ({ id: int(record(p).id) ?? 0, url: fileUrl(record(p).url) }))
      .filter((p) => p.url),
  };
}

function toLine(raw: unknown): Line {
  const l = record(raw);
  const detail = record(l.detail);
  const noProof = flag(l.no_proof);
  const currentVersion = Math.max(0, int(l.current_version) ?? 0);
  const fallback: LineStatus = noProof ? "NO_PROOF_NEEDED" : currentVersion === 0 ? "NOT_SENT" : "WAITING";
  return {
    id: int(l.id) ?? 0,
    title: text(l.title) ?? "",
    detail: {
      color: text(detail.color),
      sizes_text: text(detail.sizes_text),
      print_methods: texts(detail.print_methods),
      locations: texts(detail.locations),
    },
    customer_artwork: array(l.customer_artwork)
      .map((a) => ({ url: fileUrl(record(a).url) }))
      .filter((a) => a.url),
    no_proof: noProof,
    status: oneOf(l.status, LINE_STATUSES) ?? fallback,
    current_version: currentVersion,
    approved_version: int(l.approved_version),
    approved_at: text(l.approved_at),
    versions: array(l.versions)
      .map(toVersion)
      .filter((v): v is Version => v !== null)
      .sort((a, b) => a.version - b.version),
    notes: array(l.notes)
      .map(toNote)
      .filter((n): n is Note => n !== null)
      .sort((a, b) => a.event_id - b.event_id),
    history: array(l.history)
      .map((h) => {
        const e = record(h);
        return {
          event_id: int(e.event_id) ?? 0,
          type: text(e.type) ?? "",
          version: int(e.version),
          created_at: text(e.created_at),
          batch_id: text(e.batch_id),
          undone: flag(e.undone),
        };
      })
      .sort((a, b) => b.event_id - a.event_id),
    undo_event_id: int(l.undo_event_id),
  };
}

/** The view from an API answer's `data`, or null when `data` isn't a view. */
function toView(raw: unknown): PublicView | null {
  const data = record(raw);
  if (!Array.isArray(data.lines) || typeof data.order !== "object" || data.order === null) return null;
  const order = record(data.order);
  const state = record(data.state);
  const lastBatch = record(data.last_batch);
  const batchId = text(lastBatch.batch_id);
  const status: ApprovalStatus = oneOf(state.status, APPROVAL_STATUSES) ?? "WAITING";
  const reason: ReadOnlyReason | null = oneOf(state.reason, REASONS);
  return {
    order: { number: text(order.number) ?? "", placed_at: text(order.placed_at), first_name: text(order.first_name) },
    state: {
      status,
      read_only: flag(state.read_only) || reason !== null,
      reason,
      approved_count: int(state.approved_count) ?? 0,
      total_count: int(state.total_count) ?? 0,
    },
    support_email: text(data.support_email)?.trim() || null,
    lines: data.lines.map(toLine),
    last_batch: batchId ? { batch_id: batchId, undoable: flag(lastBatch.undoable) } : null,
  };
}
