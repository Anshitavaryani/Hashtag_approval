"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { ArrowLeft, ChevronLeft, ChevronRight } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * The review of one item on phones and tablets: full screen over the list, with All items to go
 * back and Previous / Next to move between items. Radix keeps focus inside, closes on Escape
 * and gives focus back to the card that opened it.
 */
export function ReviewSheet({
  open,
  onOpenChange,
  title,
  position,
  onPrevious,
  onNext,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The item's name, for screen readers. */
  title: string;
  position: { index: number; total: number };
  onPrevious: (() => void) | null;
  onNext: (() => void) | null;
  children: ReactNode;
}) {
  const scroller = useRef<HTMLDivElement>(null);
  // Another item (Previous, Next or Next item) starts at its top.
  useEffect(() => {
    scroller.current?.scrollTo({ top: 0 });
  }, [position.index]);

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Content
          aria-describedby={undefined}
          className="fixed inset-0 z-50 flex flex-col bg-card outline-none data-open:animate-in data-open:slide-in-from-bottom-8 data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0"
        >
          <div className="border-b border-border/70 bg-card pt-[env(safe-area-inset-top)]">
            <div className="mx-auto flex h-14 w-full max-w-2xl items-center gap-1 px-1.5">
              <DialogPrimitive.Close asChild>
                <Button variant="ghost" className="px-3">
                  <ArrowLeft aria-hidden />
                  All items
                </Button>
              </DialogPrimitive.Close>
              <DialogPrimitive.Title className="flex-1 text-center text-sm font-semibold tabular-nums">
                Item {position.index} of {position.total}
                <span className="sr-only">: {title}</span>
              </DialogPrimitive.Title>
              {/* Named apart from the "Next item" button after approving, which skips to the next item still waiting. */}
              <Button variant="ghost" size="icon" aria-label="Go to the previous item" disabled={!onPrevious} onClick={() => onPrevious?.()}>
                <ChevronLeft aria-hidden />
              </Button>
              <Button variant="ghost" size="icon" aria-label="Go to the next item" disabled={!onNext} onClick={() => onNext?.()}>
                <ChevronRight aria-hidden />
              </Button>
            </div>
          </div>
          <div ref={scroller} className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
            <div className="mx-auto w-full max-w-2xl">{children}</div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}
