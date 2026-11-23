"use client";

import { useRef, useState } from "react";
import { ImageOff, Maximize2 } from "lucide-react";

import { Thumb } from "@/components/Thumb";
import { Button } from "@/components/ui/button";
import type { ViewerImage } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * The artwork preview inside the page: one image at a time in a box that never gets taller than
 * 320 px on phones and 420 px on wide screens. Nothing is drawn over the artwork; the small
 * pictures (or a swipe) switch images, and a click or tap opens it full size.
 */
export function ImageStage({
  images,
  index,
  onIndexChange,
  onEnlarge,
}: {
  images: ViewerImage[];
  index: number;
  onIndexChange: (index: number) => void;
  onEnlarge: (index: number) => void;
}) {
  const touchStart = useRef<number | null>(null);
  const count = images.length;
  if (count === 0) {
    return (
      <div className="flex aspect-[4/3] max-h-64 w-full flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-input bg-surface px-6 text-center text-sm text-muted-foreground">
        <ImageOff className="size-6" aria-hidden />
        This version has no images.
      </div>
    );
  }
  const current = Math.min(index, count - 1);
  const image = images[current];

  return (
    <div className="space-y-2.5">
      <button
        type="button"
        onClick={() => onEnlarge(current)}
        onTouchStart={(event) => {
          touchStart.current = event.touches.length === 1 ? event.touches[0].clientX : null;
        }}
        onTouchEnd={(event) => {
          const start = touchStart.current;
          touchStart.current = null;
          if (start === null || count < 2 || event.changedTouches.length !== 1) return;
          const distance = event.changedTouches[0].clientX - start;
          if (Math.abs(distance) > 50) onIndexChange((current + (distance < 0 ? 1 : -1) + count) % count);
        }}
        className="relative block aspect-square max-h-80 w-full cursor-zoom-in overflow-hidden rounded-xl border border-border/70 bg-surface transition-shadow hover:shadow-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 lg:max-h-[420px]"
      >
        <StageImage key={image.src} image={image} />
        <span className="sr-only">(opens full size)</span>
      </button>

      <div className="flex items-center gap-2">
        {count > 1 ? (
          <ul className="flex min-w-0 flex-1 gap-2 overflow-x-auto p-0.5" aria-label="Images of this version">
            {images.map((item, i) => (
              <li key={`${i}:${item.src}`} className="shrink-0">
                <button
                  type="button"
                  onClick={() => onIndexChange(i)}
                  aria-label={`Show image ${i + 1} of ${count}`}
                  aria-current={i === current ? "true" : undefined}
                  className={cn(
                    "block size-12 overflow-hidden rounded-lg border-2 bg-surface p-0.5 transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 sm:size-14",
                    i === current ? "border-foreground" : "border-border/70 opacity-75 hover:opacity-100",
                  )}
                >
                  <Thumb key={item.src} src={item.src} alt="" className="rounded-md" />
                </button>
              </li>
            ))}
          </ul>
        ) : (
          <span className="flex-1" />
        )}
        <Button variant="ghost" className="shrink-0 px-3 text-sm" onClick={() => onEnlarge(current)}>
          <Maximize2 aria-hidden />
          View full size
        </Button>
      </div>
    </div>
  );
}

function StageImage({ image }: { image: ViewerImage }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <span className="absolute inset-0 flex flex-col items-center justify-center gap-2 px-6 text-sm text-muted-foreground">
        <ImageOff className="size-6" aria-hidden />
        This image didn&apos;t load. Open it to try again.
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- files from the API's server, shown as they are
    <img
      src={image.src}
      alt={image.alt}
      decoding="async"
      onError={() => setFailed(true)}
      className="absolute inset-0 size-full object-contain p-2"
    />
  );
}
