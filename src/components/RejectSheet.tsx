"use client";

import { useCallback, useId, useRef, useState, type ComponentProps } from "react";
import { ImagePlus, Loader2, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Sheet, SheetContent } from "@/components/ui/sheet";
import type { Outcome } from "@/lib/outcome";
import { cn } from "@/lib/utils";

// The backend's limits: PNG or JPEG, 10 MB each, 5 per rejection, 2000 characters.
const MAX_CHARS = 2000;
const MAX_PICTURES = 5;
const MAX_BYTES = 10 * 1024 * 1024;

export interface Picture {
  key: number;
  file: File;
}

/** What the customer typed and picked in an item's Reject box, kept until a Submit goes through. */
export interface RejectDraft {
  text: string;
  pictures: Picture[];
}

export const EMPTY_DRAFT: RejectDraft = { text: "", pictures: [] };

const isPngOrJpeg = (file: File) =>
  file.type === "image/png" || file.type === "image/jpeg" || (!file.type && /\.(png|jpe?g)$/i.test(file.name));

/**
 * The Reject box for an item's newest version: what to change and up to five pictures, then
 * Submit. A note or a picture is needed. The draft, and the version and last choice recorded
 * when the box opened, belong to the page (ApprovalApp): closing the box, or a Submit the page
 * refuses because it was out of date, keeps what was typed and picked.
 */
export function RejectSheet({
  open,
  onOpenChange,
  itemTitle,
  version,
  lastChoiceId,
  draft,
  onDraftChange,
  sending,
  disabled,
  onSubmit,
  onCloseAutoFocus,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemTitle: string;
  /** The version being rejected: the newest one when the box opened. */
  version: number;
  /** The item's last choice when the box opened, or null. */
  lastChoiceId: number | null;
  draft: RejectDraft;
  onDraftChange: (draft: RejectDraft) => void;
  sending: boolean;
  disabled: boolean;
  onSubmit: (form: FormData) => Promise<Outcome>;
  onCloseAutoFocus: ComponentProps<typeof SheetContent>["onCloseAutoFocus"];
}) {
  const [problem, setProblem] = useState("");
  const input = useRef<HTMLInputElement>(null);
  const ids = useId();
  const { text, pictures } = draft;

  const addFiles = (files: FileList | null) => {
    if (!files?.length) return;
    const added: Picture[] = [];
    const refused: string[] = [];
    let key = pictures.reduce((max, picture) => Math.max(max, picture.key), -1) + 1;
    for (const file of Array.from(files)) {
      if (!isPngOrJpeg(file)) refused.push(`${file.name} isn't a PNG or JPG picture.`);
      else if (file.size > MAX_BYTES) refused.push(`${file.name} is larger than 10 MB.`);
      else if (pictures.length + added.length >= MAX_PICTURES) refused.push(`You can add up to ${MAX_PICTURES} pictures.`);
      else added.push({ key: key++, file });
    }
    onDraftChange({ text, pictures: [...pictures, ...added] });
    setProblem([...new Set(refused)].join(" "));
    // Lets the same file be picked again after it was removed.
    if (input.current) input.current.value = "";
  };

  const submit = async () => {
    const body = text.trim();
    if (!body && pictures.length === 0) {
      setProblem("Tell us what to change, or add a picture.");
      return;
    }
    setProblem("");
    // Text fields before the files, so the server has read them by the time it checks the files.
    const form = new FormData();
    if (body) form.append("body", body);
    form.append("version", String(version));
    form.append("last_choice_id", lastChoiceId === null ? "" : String(lastChoiceId));
    for (const picture of pictures) form.append("approval_picture", picture.file, picture.file.name);
    const outcome = await onSubmit(form);
    if (outcome.status === "failed" && outcome.message) setProblem(outcome.message);
  };

  const remaining = MAX_CHARS - text.length;

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        // While the pictures are on their way the box stays, so the answer has somewhere to show.
        if (!sending) onOpenChange(next);
      }}
    >
      <SheetContent
        title={`Reject Version ${version}`}
        description={itemTitle}
        onCloseAutoFocus={onCloseAutoFocus}
        footer={
          <>
            <Button variant="outline" disabled={sending} onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button onClick={submit} disabled={sending || disabled}>
              {sending ? <Loader2 className="animate-spin" aria-hidden /> : null}
              {sending ? "Submitting…" : "Submit"}
            </Button>
          </>
        }
      >
        <div className="space-y-5">
          <p className="text-sm leading-relaxed">Tell us what to change. We&apos;ll send you a new version to check.</p>

          <div className="space-y-1.5">
            <label htmlFor={`${ids}-body`} className="text-sm font-medium">
              What should we change?
            </label>
            <textarea
              id={`${ids}-body`}
              value={text}
              maxLength={MAX_CHARS}
              rows={5}
              onChange={(event) => {
                onDraftChange({ text: event.target.value, pictures });
                setProblem("");
              }}
              aria-describedby={`${ids}-count`}
              className="block w-full resize-y rounded-lg border border-input bg-card px-3 py-2 text-base focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
              placeholder="For example: make the logo a little bigger, or move it 1 inch higher."
            />
            <p
              id={`${ids}-count`}
              aria-live={remaining <= 100 ? "polite" : "off"}
              className={cn("text-right text-xs", remaining <= 100 ? "text-primary-ink" : "text-muted-foreground")}
            >
              {text.length} / {MAX_CHARS} characters
            </p>
          </div>

          <div className="space-y-2">
            <p className="text-sm font-medium" id={`${ids}-pictures`}>
              Pictures <span className="font-normal text-muted-foreground">(optional)</span>
            </p>
            <p className="text-xs text-muted-foreground">
              Show us what you mean: PNG or JPG, up to {MAX_PICTURES} pictures, 10 MB each.
            </p>
            {pictures.length > 0 ? (
              <ul className="grid grid-cols-3 gap-2 sm:grid-cols-5" aria-labelledby={`${ids}-pictures`}>
                {pictures.map((picture, i) => (
                  <li key={picture.key} className="relative aspect-square overflow-hidden rounded-lg border border-border bg-muted">
                    <PicturePreview file={picture.file} alt={`Picture ${i + 1}: ${picture.file.name}`} />
                    <Button
                      variant="ghost"
                      size="icon"
                      className="absolute top-0 right-0 rounded-full bg-card/85 hover:bg-card"
                      aria-label={`Remove picture ${i + 1}`}
                      disabled={sending}
                      onClick={() => {
                        onDraftChange({ text, pictures: pictures.filter((p) => p !== picture) });
                        setProblem("");
                      }}
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
            <Button
              variant="outline"
              onClick={() => input.current?.click()}
              disabled={sending || pictures.length >= MAX_PICTURES}
            >
              <ImagePlus aria-hidden />
              {pictures.length ? "Add more pictures" : "Add pictures"}
            </Button>
          </div>

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

/**
 * A picked picture, drawn from the file itself. Its local address is made when the picture
 * appears and freed when it goes (removed, or the box closed).
 */
function PicturePreview({ file, alt }: { file: File; alt: string }) {
  const attach = useCallback(
    (img: HTMLImageElement | null) => {
      if (!img) return;
      const url = URL.createObjectURL(file);
      img.src = url;
      return () => URL.revokeObjectURL(url);
    },
    [file],
  );
  // eslint-disable-next-line @next/next/no-img-element -- a local preview (blob: URL)
  return <img ref={attach} alt={alt} className="size-full object-cover" />;
}
