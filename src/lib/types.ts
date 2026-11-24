// The public approval view (backend: GET /api/v1/approval). It never carries
// prices, email or postal addresses, IPs or team names.

export type ApprovalStatus = "DRAFT" | "WAITING" | "CHANGES_REQUESTED" | "APPROVED";
/** CHANGES_REQUESTED: the customer rejected the newest version (the page says "Rejected"). */
export type LineStatus = "NOT_SENT" | "NO_PROOF_NEEDED" | "WAITING" | "CHANGES_REQUESTED" | "APPROVED";
export type ReadOnlyReason = "LOCKED" | "SHIPPED" | "CANCELLED";
/** Where one sent version stands. REPLACED: a newer one was sent before it was chosen, or after it was approved. */
export type VersionStatus = "WAITING" | "APPROVED" | "REJECTED" | "REPLACED";
/** A customer's choice on an item: Approve or Reject the newest version, or go back to an older one. */
export type ChoiceKind = "APPROVED" | "REJECTED" | "WENT_BACK";
export type HistoryKind =
  | "SENT"
  | "APPROVED"
  | "WENT_BACK"
  | "REJECTED"
  | "UNDID_APPROVAL"
  | "UNDID_GO_BACK"
  | "UNDID_REJECTION";

export interface ProofFile {
  id: number;
  url: string;
  preview_url: string | null;
  name: string;
  mime: string;
}

/** A rejection: what the customer wrote (or null) and their pictures. `removed`: taken back with Undo. */
export interface Note {
  event_id: number;
  body: string | null;
  created_at: string | null;
  version: number | null;
  removed: boolean;
  pictures: { id: number; url: string }[];
}

export interface Version {
  version: number;
  sent_at: string | null;
  message: string | null;
  files: ProofFile[];
  status: VersionStatus;
  decided_at: string | null;
  /** Set when going back to an older version rejected this one. */
  went_back_to: number | null;
  /** The customer's rejection of this version, when they wrote one (REJECTED only). */
  note: Note | null;
}

export interface HistoryEntry {
  event_id: number;
  type: string;
  kind: HistoryKind;
  version: number | null;
  created_at: string | null;
  batch_id: string | null;
  undone: boolean;
}

/** The item's last choice: what Undo takes back. */
export interface LastChoice {
  event_id: number;
  kind: ChoiceKind;
  /** The version it names: the newest for Approve and Reject, the one gone back to for Go back. */
  version: number;
  at: string | null;
  /** Set when it came from Approve all. */
  batch_id: string | null;
}

/** What the page may offer on an item now. Everything is off while the page is read-only. */
export interface Actions {
  approve: boolean;
  reject: boolean;
  /** The older versions it can go back to, newest first. */
  go_back_to: number[];
  undo: boolean;
}

export interface Line {
  id: number;
  title: string;
  detail: { color: string | null; sizes_text: string | null; print_methods: string[]; locations: string[] };
  customer_artwork: { url: string }[];
  no_proof: boolean;
  status: LineStatus;
  current_version: number;
  approved_version: number | null;
  approved_at: string | null;
  versions: Version[];
  notes: Note[];
  history: HistoryEntry[];
  last_choice: LastChoice | null;
  actions: Actions;
  undo_event_id: number | null;
}

export interface PublicView {
  order: { number: string; placed_at: string | null; first_name: string | null };
  state: {
    status: ApprovalStatus;
    read_only: boolean;
    reason: ReadOnlyReason | null;
    approved_count: number;
    total_count: number;
  };
  support_email: string | null;
  lines: Line[];
  /** The newest Approve all: `size` items it approved; `undoable` while one of them is still its item's last choice. */
  last_batch: { batch_id: string; undoable: boolean; size: number } | null;
}

/** A picture for the image viewers. */
export interface ViewerImage {
  /** Shown first: a preview when there is one. */
  src: string;
  /** Shown instead when the picture is enlarged: the full-size file. */
  full?: string;
  alt: string;
}

/** A line the customer can approve: it has a sent artwork preview and needs one. */
export const isSent = (line: Line) =>
  !line.no_proof && line.current_version > 0 && line.status !== "NOT_SENT" && line.status !== "NO_PROOF_NEEDED";

/** The items Approve all would approve now: every item still waiting for the customer. */
export const linesToApprove = (view: PublicView) => view.lines.filter((line) => line.actions.approve);

/** Every line with a sent artwork preview is approved, and there is at least one. */
export const allSentApproved = (view: PublicView) => {
  const sent = view.lines.filter(isSent);
  return sent.length > 0 && sent.every((line) => line.status === "APPROVED");
};
