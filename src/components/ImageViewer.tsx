"use client";

import { useLayoutEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ChevronLeft, ChevronRight, ImageOff, Loader2, XIcon, ZoomIn, ZoomOut } from "lucide-react";

import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import type { ViewerImage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The full-screen viewer for artwork previews, uploaded artwork and note photos. Click the
 * picture (or Zoom) to look closer and scroll around it; the arrows, the arrow keys, a swipe or
 * the small pictures at the bottom show the others.
 */
export function ImageViewer({
  images,
  index,
  onIndexChange,
  onClose,
  title,
  action,
}: {
  images: ViewerImage[];
  index: number | null;
  onIndexChange: (index: number) => void;
  onClose: () => void;
  title: string;
  /** An extra button under the picture, e.g. "Request changes to this image". */
  action?: (index: number) => ReactNode;
}) {
  const open = index !== null && images.length > 0;
  const current = open ? Math.min(index, images.length - 1) : 0;
  const image = images[current];
  const many = images.length > 1;
  const touchStart = useRef<number | null>(null);
  const zoomed = useRef(false);

  const go = (step: number) => {
    if (!many) return;
    onIndexChange((current + step + images.length) % images.length);
  };

  return (
    <DialogPrimitive.Root open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/95 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col text-card outline-none"
          onKeyDown={(event) => {
            if (event.key === "ArrowLeft") go(-1);
            if (event.key === "ArrowRight") go(1);
          }}
        >
          <div className="flex items-center gap-2 px-2 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
            <DialogPrimitive.Title className="min-w-0 flex-1 truncate pl-2 text-sm font-medium">
              {title}
              {many ? <span className="text-card/70"> · {current + 1} of {images.length}</span> : null}
            </DialogPrimitive.Title>
            <DialogPrimitive.Close asChild>
              <Button variant="ghost" size="icon" className="rounded-full text-card hover:bg-card/15 hover:text-card" aria-label="Close">
                <XIcon aria-hidden />
              </Button>
            </DialogPrimitive.Close>
          </div>

          <div
            className="relative min-h-0 flex-1"
            onTouchStart={(event) => {
              touchStart.current = event.touches.length === 1 && !zoomed.current ? event.touches[0].clientX : null;
            }}
            onTouchEnd={(event) => {
              const start = touchStart.current;
              touchStart.current = null;
              if (start === null || event.changedTouches.length !== 1) return;
              const distance = event.changedTouches[0].clientX - start;
              if (Math.abs(distance) > 60) go(distance < 0 ? 1 : -1);
            }}
          >
            {image ? (
              <Stage key={`${current}:${image.src}`} image={image} onZoomChange={(value) => (zoomed.current = value)} />
            ) : null}
            {many ? (
              <>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 left-2 -translate-y-1/2 rounded-full bg-foreground/60 text-card hover:bg-foreground/80 hover:text-card"
                  aria-label="Previous image"
                  onClick={() => go(-1)}
                >
                  <ChevronLeft aria-hidden />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full bg-foreground/60 text-card hover:bg-foreground/80 hover:text-card"
                  aria-label="Next image"
                  onClick={() => go(1)}
                >
                  <ChevronRight aria-hidden />
                </Button>
              </>
            ) : null}
          </div>

          <div className="flex flex-col items-center gap-3 px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
            {many ? (
              <ul className="flex max-w-full gap-2 overflow-x-auto p-1" aria-label="All images">
                {images.map((item, i) => (
                  <li key={`${i}:${item.src}`} className="shrink-0">
                    <button
                      type="button"
                      onClick={() => onIndexChange(i)}
                      aria-label={`Show image ${i + 1} of ${images.length}`}
                      aria-current={i === current ? "true" : undefined}
                      className={cn(
                        "block size-12 overflow-hidden rounded-md border-2 bg-card transition-opacity focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary",
                        i === current ? "border-primary" : "border-transparent opacity-60 hover:opacity-100",
                      )}
                    >
                      <Thumb key={item.src} src={item.src} alt="" />
                    </button>
                  </li>
                ))}
              </ul>
            ) : null}
            {action ? action(current) : null}
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** One picture: fitted to the screen, or zoomed in a scrolling box. */
function Stage({ image, onZoomChange }: { image: ViewerImage; onZoomChange: (zoomed: boolean) => void }) {
  const box = useRef<HTMLDivElement>(null);
  const picture = useRef<HTMLImageElement>(null);
  // Zoomed: the width to draw the picture at, and the point (as fractions) to keep in the middle.
  const [zoom, setZoom] = useState<{ width: number; x: number; y: number } | null>(null);
  // The full-size file first; the preview if it fails; a message if both fail.
  const [source, setSource] = useState<"full" | "preview" | "failed">(image.full && image.full !== image.src ? "full" : "preview");
  const [loaded, setLoaded] = useState(false);
  const src = source === "full" ? image.full : image.src;

  useLayoutEffect(() => {
    const el = box.current;
    if (!zoom || !el) return;
    el.scrollLeft = zoom.x * el.scrollWidth - el.clientWidth / 2;
    el.scrollTop = zoom.y * el.scrollHeight - el.clientHeight / 2;
  }, [zoom]);

  const toggle = (point?: { x: number; y: number }) => {
    const el = picture.current;
    if (zoom || !el) {
      setZoom(null);
      onZoomChange(false);
      return;
    }
    // At least twice the fitted size, or the picture's own size when that is larger.
    setZoom({ width: Math.max(el.naturalWidth, el.clientWidth * 2), x: point?.x ?? 0.5, y: point?.y ?? 0.5 });
    onZoomChange(true);
  };

  const onPictureClick = (event: MouseEvent<HTMLImageElement>) => {
    const rect = event.currentTarget.getBoundingClientRect();
    toggle({ x: (event.clientX - rect.left) / rect.width, y: (event.clientY - rect.top) / rect.height });
  };

  if (source === "failed") {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-2 px-6 text-center text-sm" role="alert">
        <ImageOff className="size-8" aria-hidden />
        We couldn&apos;t load this image. Check your connection and try again.
      </div>
    );
  }

  return (
    <>
      {/* Auto margins centre the picture without cutting off its edges once it is larger than the box. */}
      <div ref={box} className={cn("flex h-full w-full p-2", zoom ? "overflow-auto" : "overflow-hidden")}>
        {/* eslint-disable-next-line @next/next/no-img-element -- files from the API's server, shown as they are */}
        <img
          ref={picture}
          src={src}
          alt={image.alt}
          onLoad={() => setLoaded(true)}
          onError={() => {
            setLoaded(false);
            setSource(source === "full" ? "preview" : "failed");
          }}
          onClick={onPictureClick}
          style={zoom ? { width: zoom.width, maxWidth: "none", maxHeight: "none" } : undefined}
          className={cn(
            "m-auto rounded-sm bg-card",
            zoom ? "cursor-zoom-out" : "max-h-full max-w-full cursor-zoom-in object-contain",
            loaded ? "animate-image-fade" : "opacity-0",
          )}
        />
      </div>
      {!loaded ? (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center" role="status">
          <Loader2 className="size-8 animate-spin" aria-hidden />
          <span className="sr-only">Loading the image…</span>
        </div>
      ) : null}
      <Button
        variant="ghost"
        size="icon"
        className="absolute right-2 bottom-2 rounded-full bg-foreground/60 text-card hover:bg-foreground/80 hover:text-card"
        aria-label={zoom ? "Zoom out" : "Zoom in"}
        aria-pressed={zoom !== null}
        disabled={!loaded}
        onClick={() => toggle()}
      >
        {zoom ? <ZoomOut aria-hidden /> : <ZoomIn aria-hidden />}
      </Button>
    </>
  );
}
