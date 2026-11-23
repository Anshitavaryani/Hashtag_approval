// What the page shows about one item (line): its name and options, its pictures, where it
// stands, and which item to look at next. Pure functions of the view, no state.
// Customer wording (CONTRACT section 12): "artwork preview", "Version 2 (latest)", never "proof".
import { decodeEntities, prettyOption } from "./format";
import { isSent, type Line, type Note, type PublicView, type Version, type ViewerImage } from "./types";

export const lineTitle = (line: Line) => decodeEntities(line.title) || "Item";

/** Colour, sizes, print methods and print locations, for the chips under an item's name. */
export function lineOptions(line: Line): { label: string; value: string }[] {
  const { color, sizes_text: sizes, print_methods: methods, locations } = line.detail;
  return [
    color ? { label: "Color", value: decodeEntities(color) } : null,
    sizes ? { label: "Sizes", value: decodeEntities(sizes) } : null,
    ...methods.map((m) => ({ label: "Print method", value: prettyOption(m) })),
    ...locations.map((l) => ({ label: "Print location", value: prettyOption(l) })),
  ].filter((item): item is { label: string; value: string } => item !== null && item.value.trim() !== "");
}

/**
 * An item waiting for the customer: a sent artwork preview that isn't approved and has no open
 * request for changes (after asking for changes, it's our turn).
 */
export const needsReview = (line: Line) => isSent(line) && line.status === "WAITING";

/** The item to open first: the first one waiting for the customer, otherwise the first item. */
export const firstToReview = (view: PublicView): number | null => (view.lines.find(needsReview) ?? view.lines[0])?.id ?? null;

/** The version to show first: the approved one while it stands, otherwise the newest. */
export function mainVersion(line: Line): Version | null {
  const approved = line.status === "APPROVED" ? line.versions.find((v) => v.version === line.approved_version) : undefined;
  return approved ?? line.versions[line.versions.length - 1] ?? null;
}

/** The first picture of the version shown first, for the item's card. */
export function coverImage(line: Line): string | null {
  const file = mainVersion(line)?.files[0];
  return file ? file.preview_url || file.url : null;
}

/** "Version 2 (latest)" once there is more than one version, otherwise "Version 1". */
export const versionName = (line: Line, version: number) =>
  version === line.current_version && line.versions.length > 1 ? `Version ${version} (latest)` : `Version ${version}`;

const isRaster = (mime: string, name: string) => /^image\/(png|jpe?g)$/i.test(mime) || /\.(png|jpe?g)$/i.test(name);

/**
 * A version's pictures for the viewers. Previews first; a PNG or JPG opens at full size when
 * enlarged, an SVG keeps its server-drawn preview (it shows the fonts as they will print).
 */
export function versionImages(line: Line, version: Version): ViewerImage[] {
  const count = version.files.length;
  return version.files.map((file, i) => ({
    src: file.preview_url || file.url,
    full: isRaster(file.mime, file.name) ? file.url : undefined,
    alt: `Artwork preview of ${lineTitle(line)}, version ${version.version}${count > 1 ? `, image ${i + 1} of ${count}` : ""}`,
  }));
}

export type Tone = "waiting" | "progress" | "success";

/**
 * Where an item stands, as a short status for its pill. Once the page is read-only nothing is
 * still to come, so "waiting" wording would mislead.
 */
export function lineStatus(line: Line, readOnly: boolean): { label: string; tone: Tone } {
  switch (line.status) {
    case "APPROVED":
      return { label: "Approved", tone: "success" };
    case "CHANGES_REQUESTED":
      return { label: "Changes requested", tone: "progress" };
    case "WAITING":
      if (readOnly) return { label: "Not approved", tone: "progress" };
      return { label: line.current_version > 1 ? "Updated artwork" : "Needs your review", tone: "waiting" };
    case "NO_PROOF_NEEDED":
      return { label: "No preview needed", tone: "progress" };
    default:
      return { label: readOnly ? "No preview sent" : "Coming soon", tone: "progress" };
  }
}

/**
 * The item to go to after this one: the next one still waiting for the customer (after it,
 * then from the top), or null when nothing else is.
 */
export function nextToReview(lines: Line[], fromId: number | null): Line | null {
  const start = lines.findIndex((line) => line.id === fromId);
  const ordered = start < 0 ? lines : [...lines.slice(start + 1), ...lines.slice(0, start)];
  return ordered.find(needsReview) ?? null;
}

/**
 * The version we sent after a note, or null while the note is still open. Once a newer version
 * is sent, the notes before it no longer ask for changes (CONTRACT section 3, rules 2 and 6). Read
 * from the event order, not the note's version: a note on an older version written after the
 * newest one was sent is still open.
 */
export function answeredBy(line: Line, note: Pick<Note, "event_id">): number | null {
  const later = line.history
    .filter((entry) => entry.type === "VERSION_SENT" && entry.event_id > note.event_id && entry.version !== null)
    .map((entry) => entry.version as number);
  return later.length > 0 ? Math.min(...later) : null;
}

/** Where a note's image sits among its version's pictures, e.g. { version: 2, index: 1 } for "About image 2". */
export function noteImage(line: Line, note: Pick<Note, "version" | "file_id">) {
  if (note.file_id === null) return null;
  const version =
    line.versions.find((v) => v.version === note.version && v.files.some((f) => f.id === note.file_id)) ??
    line.versions.find((v) => v.files.some((f) => f.id === note.file_id));
  const index = version ? version.files.findIndex((f) => f.id === note.file_id) : -1;
  return version && index >= 0 ? { version: version.version, index } : null;
}
