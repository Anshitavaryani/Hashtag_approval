"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ImagePlus, Loader2, Send, X } from "lucide-react";

import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Outcome } from "@/lib/outcome";
import { cn } from "@/lib/utils";

// The backend's limits (CONTRACT section 7): PNG or JPEG, 10 MB each, 5 per note, 2000 characters.
const MAX_CHARS = 2000;
const MAX_PHOTOS = 5;
const MAX_BYTES = 10 * 1024 * 1024;

interface Photo {
  key: number;
  file: File;
  url: string;
}

const isPngOrJpeg = (file: File) =>
  file.type === "image/png" || file.type === "image/jpeg" || (!file.type && /\.(png|jpe?g)$/i.test(file.name));

/**
 * "Request changes" for one item: what to change, optional photos, which image it is about and,
 * when the item is approved, whether to keep that approval. It stays mounted while the item is
 * on screen, so closing it keeps what was typed and the photos picked; sending clears them.
 */
export function NoteSheet({
  open,
  onOpenChange,
  itemTitle,
  version,
  versionLabel,
  images,
  about,
  onAboutChange,
  askUndo,
  sending,
  disabled,
  onSend,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemTitle: string;
  /** The version on screen: the note is about it. */
  version: number;
  versionLabel: string;
  /** That version's images, to say which one the note is about (offered when there are several). */
  images: { fileId: number; src: string }[];
  about: number | null;
  onAboutChange: (fileId: number | null) => void;
  /** The item is approved: ask whether to keep that approval. */
  askUndo: boolean;
  sending: boolean;
  disabled: boolean;
  onSend: (form: FormData) => Promise<Outcome>;
}) {
  const [body, setBody] = useState("");
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [choice, setChoice] = useState<"keep" | "undo" | null>(null);
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const nextKey = useRef(0);
  const ids = useId();
  const aboutIndex = images.findIndex((image) => image.fileId === about);

  // Free the photo previews when the item leaves the page.
  const latest = useRef<Photo[]>([]);
  useEffect(() => {
    latest.current = photos;
  }, [photos]);
  useEffect(() => () => latest.current.forEach((p) => URL.revokeObjectURL(p.url)), []);

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Photo[] = [];
    const refused: string[] = [];
    for (const file of Array.from(files)) {
      if (!isPngOrJpeg(file)) refused.push(`${file.name} isn't a PNG or JPG photo.`);
      else if (file.size > MAX_BYTES) refused.push(`${file.name} is larger than 10 MB.`);
      else if (photos.length + added.length >= MAX_PHOTOS) refused.push(`You can add up to ${MAX_PHOTOS} photos to a note.`);
      else added.push({ key: nextKey.current++, file, url: URL.createObjectURL(file) });
    }
    setPhotos([...photos, ...added]);
    setProblem([...new Set(refused)].join(" "));
    // Lets the same file be picked again after it was removed.
    if (input.current) input.current.value = "";
  };

  const removePhoto = (photo: Photo) => {
    URL.revokeObjectURL(photo.url);
    setPhotos(photos.filter((p) => p !== photo));
  };

  const send = async () => {
    const text = body.trim();
    if (!text && photos.length === 0) {
      setProblem("Tell us what you'd like to change, or add a photo.");
      return;
    }
    if (askUndo && !choice) {
      setProblem("Choose whether to keep your approval.");
      return;
    }
    setProblem("");
    // Text fields before the files, so the server has read them by the time it checks the files.
    const form = new FormData();
    if (text) form.append("body", text);
    form.append("version", String(version));
    if (aboutIndex >= 0) form.append("file_id", String(images[aboutIndex].fileId));
    form.append("undo_approval", askUndo && choice === "undo" ? "true" : "false");
    for (const photo of photos) form.append("approval_picture", photo.file, photo.file.name);

    const outcome = await onSend(form);
    if (outcome.status === "done") {
      photos.forEach((p) => URL.revokeObjectURL(p.url));
      setBody("");
      setPhotos([]);
      setChoice(null);
      onOpenChange(false);
    } else if (outcome.status === "failed" && outcome.message) {
      setProblem(outcome.message);
    }
  };

  const remaining = MAX_CHARS - body.length;
  const justANote = askUndo && choice === "keep";

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        title={justANote ? "Send a note" : "Request changes"}
        description={`${itemTitle} · ${versionLabel}`}
        footer={
          <>
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={send} disabled={sending || disabled}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : <Send aria-hidden />}
              {sending ? "Sending…" : justANote ? "Send note" : "Send request"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          {images.length > 1 ? (
            <fieldset>
              <legend className="mb-2 text-sm font-medium">Which image is it about?</legend>
              <div className="flex flex-wrap gap-2">
                {[{ fileId: null, src: "" }, ...images].map((image, i) => {
                  const checked = image.fileId === null ? aboutIndex < 0 : image.fileId === about;
                  return (
                    <label
                      key={image.fileId ?? "all"}
                      className={cn(
                        "flex min-h-11 cursor-pointer items-center gap-2 rounded-full border py-1 pr-3.5 pl-1.5 text-sm font-medium has-focus-visible:ring-2 has-focus-visible:ring-ring",
                        image.fileId === null && "pl-3.5",
                        checked ? "border-foreground bg-primary-soft" : "border-input bg-card hover:bg-muted",
                      )}
                    >
                      <input
                        type="radio"
                        name={`${ids}-about`}
                        className="sr-only"
                        checked={checked}
                        onChange={() => onAboutChange(image.fileId)}
                      />
                      {image.fileId !== null ? (
                        <span className="block size-8 overflow-hidden rounded-full border border-border bg-surface">
                          <Thumb key={image.src} src={image.src} alt="" />
                        </span>
                      ) : null}
                      {image.fileId === null ? "The whole item" : `Image ${i}`}
                    </label>
                  );
                })}
              </div>
            </fieldset>
          ) : null}

          <div className="space-y-1.5">
            <label htmlFor={`${ids}-body`} className="text-sm font-medium">
              {justANote ? "Your note" : "What would you like us to change?"}
            </label>
            <textarea
              id={`${ids}-body`}
              value={body}
              maxLength={MAX_CHARS}
              rows={5}
              onChange={(event) => setBody(event.target.value)}
              aria-describedby={`${ids}-count`}
              className="block w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              placeholder="For example: make the logo a little bigger, or move it 1 inch higher."
            />
            <p
              id={`${ids}-count`}
              aria-live={remaining <= 100 ? "polite" : "off"}
              className={cn("text-right text-xs", remaining <= 100 ? "text-primary-ink" : "text-muted-foreground")}
            >
              {body.length} / {MAX_CHARS} characters
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id={`${ids}-photos`}>
              Photos <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Show us what you mean: PNG or JPG, up to {MAX_PHOTOS} photos, 10 MB each.
            </p>
            {photos.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-labelledby={`${ids}-photos`}>
                {photos.map((photo, i) => (
                  <li key={photo.key} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL) */}
                    <img src={photo.url} alt={`Photo ${i + 1}: ${photo.file.name}`} className="size-full object-cover" />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 rounded-full bg-card/85 hover:bg-card"
                      aria-label={`Remove photo ${i + 1}`}
                      onClick={() => removePhoto(photo)}
                    >
                      <X aria-hidden />
                    </Button>
                  </li>
                ))}
              </ul>
            ) : null}
            <input
              ref={input}
              type="file"
              accept="image/png,image/jpeg"
              multiple
              className="sr-only"
              tabIndex={-1}
              aria-hidden
              onChange={(event) => addFiles(event.target.files)}
            />
            <Button variant="outline" onClick={() => input.current?.click()} disabled={photos.length >= MAX_PHOTOS}>
              <ImagePlus aria-hidden />
              {photos.length ? "Add more photos" : "Add photos"}
            </Button>
          </div>

          {askUndo ? (
            <fieldset className="space-y-2">
              <legend className="mb-2 text-sm font-medium">You approved this item. What should happen to your approval?</legend>
              {(
                [
                  ["undo", "Undo my approval", "We'll make your changes and send you an updated version to approve."],
                  ["keep", "Keep my approval", "We'll read your note, and the item stays approved."],
                ] as const
              ).map(([value, label, hint]) => (
                <label
                  key={value}
                  className={cn(
                    "flex min-h-11 cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 text-sm",
                    choice === value ? "border-foreground bg-primary-soft" : "border-border hover:bg-muted/60",
                  )}
                >
                  <input
                    type="radio"
                    name={`${ids}-choice`}
                    value={value}
                    checked={choice === value}
                    onChange={() => setChoice(value)}
                    className="mt-0.5 size-5 shrink-0 accent-primary-ink"
                  />
                  <span>
                    <span className="block font-medium">{label}</span>
                    <span className="block text-muted-foreground">{hint}</span>
                  </span>
                </label>
              ))}
            </fieldset>
          ) : null}

          {problem ? (
            <p role="alert" className="rounded-lg bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {problem}
            </p>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
