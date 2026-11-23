// The public approval view (backend: GET /api/v1/approval). It never carries
// prices, email or postal addresses, IPs or team names.

export type ApprovalStatus = "DRAFT" | "WAITING" | "CHANGES_REQUESTED" | "APPROVED";
export type LineStatus = "NOT_SENT" | "NO_PROOF_NEEDED" | "WAITING" | "CHANGES_REQUESTED" | "APPROVED";
export type ReadOnlyReason = "LOCKED" | "SHIPPED" | "CANCELLED";

export interface ProofFile {
  id: number;
  url: string;
  preview_url: string | null;
  name: string;
  mime: string;
}

export interface Version {
  version: number;
  sent_at: string | null;
  message: string | null;
  files: ProofFile[];
}

export interface Note {
  event_id: number;
  body: string | null;
  created_at: string | null;
  version: number | null;
  file_id: number | null;
  removed: boolean;
  pictures: { id: number; url: string }[];
}

export interface HistoryEntry {
  event_id: number;
  type: string;
  version: number | null;
  created_at: string | null;
  batch_id: string | null;
  undone: boolean;
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
  last_batch: { batch_id: string; undoable: boolean } | null;
}

/** A picture for the image viewers. */
export interface ViewerImage {
  /** Shown first: a preview when there is one. */
  src: string;
  /** Shown instead when the picture is enlarged: the full-size file. */
  full?: string;
  alt: string;
}

/** A line the customer can approve: it has a sent proof and needs one. */
export const isSent = (line: Line) =>
  !line.no_proof && line.current_version > 0 && line.status !== "NOT_SENT" && line.status !== "NO_PROOF_NEEDED";

/** Lines that Approve all would approve now (CONTRACT section 3, rule 5). */
export const linesToApprove = (view: PublicView) =>
  view.lines.filter((line) => isSent(line) && (line.status === "WAITING" || line.status === "CHANGES_REQUESTED"));

/** Every line with a sent proof is approved, and there is at least one: the Approve all box shows ticked. */
export const allSentApproved = (view: PublicView) => {
  const sent = view.lines.filter(isSent);
  return sent.length > 0 && sent.every((line) => line.status === "APPROVED");
};
