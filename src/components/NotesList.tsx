"use client";

import { CornerDownRight, Loader2 } from "lucide-react";

import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { formatTime, isoTime } from "@/lib/format";
import { answeredBy, noteImage } from "@/lib/lines";
import type { Line, Note } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The customer's notes on one item as a short conversation, oldest first. Removed notes stay,
 * struck through, and can be restored. A note we've answered with a newer version says so
 * instead: it no longer asks for anything, so it isn't counted and can't be removed.
 */
export function NotesList({
  line,
  readOnly,
  busy,
  onToggle,
  onShowPhotos,
  onShowImage,
}: {
  line: Line;
  readOnly: boolean;
  busy: string | null;
  onToggle: (note: Note) => void;
  onShowPhotos: (note: Note, index: number) => void;
  onShowImage: (version: number, index: number) => void;
}) {
  if (line.notes.length === 0) return null;
  const open = line.notes.filter((n) => !n.removed && answeredBy(line, n) === null).length;

  return (
    <section aria-labelledby={`notes-${line.id}`} className="space-y-3">
      <h3 id={`notes-${line.id}`} className="text-sm font-semibold">
        Your notes{open ? <span className="font-normal text-muted-foreground"> ({open})</span> : null}
      </h3>
      <ol className="space-y-3">
        {line.notes.map((note) => {
          const image = noteImage(line, note);
          const working = busy === `note:${note.event_id}`;
          const answered = answeredBy(line, note);
          return (
            <li key={note.event_id} className="flex flex-col items-end">
              <div
                className={cn(
                  "w-fit max-w-[92%] min-w-40 rounded-2xl rounded-tr-md border px-3.5 py-2.5 text-sm",
                  note.removed ? "border-dashed border-input bg-muted/40 text-muted-foreground" : "border-border bg-surface",
                )}
              >
                <p className="mb-1 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                  <span className="font-semibold text-foreground">You</span>
                  {note.version ? <span>· on Version {note.version}</span> : null}
                  {image ? (
                    <>
                      <span aria-hidden>·</span>
                      <button
                        type="button"
                        // The padding makes a 44 px tap target; the negative margin keeps the line compact.
                        className="-my-3.5 rounded py-3.5 font-medium text-primary-ink underline underline-offset-2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        onClick={() => onShowImage(image.version, image.index)}
                      >
                        about image {image.index + 1}
                      </button>
                    </>
                  ) : note.file_id !== null ? (
                    <span>· about an image</span>
                  ) : null}
                </p>
                {note.body ? (
                  <p className={cn("break-words whitespace-pre-wrap", note.removed && "line-through")}>{note.body}</p>
                ) : null}
                {note.pictures.length > 0 ? (
                  <ul className="mt-2 flex flex-wrap gap-1.5" aria-label="Your photos">
                    {note.pictures.map((picture, i) => (
                      <li key={`${picture.id}:${picture.url}`}>
                        <button
                          type="button"
                          onClick={() => onShowPhotos(note, i)}
                          aria-label={`Show your photo ${i + 1} of ${note.pictures.length}`}
                          className={cn(
                            "block size-14 overflow-hidden rounded-lg border border-border bg-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                            note.removed && "opacity-60",
                          )}
                        >
                          <Thumb key={picture.url} src={picture.url} alt="" className="object-cover" />
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-end gap-x-2 text-xs text-muted-foreground">
                <time dateTime={isoTime(note.created_at)}>{formatTime(note.created_at)}</time>
                {note.removed ? (
                  <span className="rounded-full bg-muted px-2 py-0.5 font-semibold text-foreground">Removed</span>
                ) : null}
                {/* An answered note shows our answer in place of Remove / Restore: it no longer asks for anything. */}
                {answered !== null && !note.removed ? (
                  <span className="inline-flex items-center gap-1 py-1 font-medium text-foreground">
                    <CornerDownRight className="size-3.5 shrink-0 text-primary-ink" aria-hidden />
                    We sent Version {answered} after this note
                  </span>
                ) : answered === null && !readOnly ? (
                  <Button variant="link" className="-mr-2 px-2 text-xs" disabled={busy !== null} onClick={() => onToggle(note)}>
                    {working ? <Loader2 className="animate-spin" aria-hidden /> : null}
                    {note.removed ? "Restore note" : "Remove note"}
                  </Button>
                ) : null}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
