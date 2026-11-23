"use client";

import { useState } from "react";

import { cn } from "@/lib/utils";

/**
 * A small picture that falls back to its file type (AI, PSD, EPS…) when the browser
 * can't draw it. Callers give it a key of its src, so a new file gets a new try.
 */
export function Thumb({ src, alt, className }: { src: string; alt: string; className?: string }) {
  const [failed, setFailed] = useState(false);
  if (failed) {
    const extension = src.split(/[?#]/)[0].split("/").pop()?.split(".").pop()?.toUpperCase() ?? "";
    return (
      <span
        role="img"
        aria-label={alt}
        className={cn("flex size-full items-center justify-center bg-muted text-xs font-semibold text-muted-foreground", className)}
      >
        {extension && extension.length <= 4 ? extension : "File"}
      </span>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- files from the API's server, shown as they are
    <img
      src={src}
      alt={alt}
      loading="lazy"
      decoding="async"
      onError={() => setFailed(true)}
      className={cn("size-full bg-card object-contain", className)}
    />
  );
}
