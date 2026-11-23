"use client";

import * as React from "react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { XIcon } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "./button";

// A Radix dialog that slides up from the bottom on phones and sits in the middle on
// larger screens. Radix moves focus in, keeps it there, closes on Escape and gives
// focus back to whatever opened it.

const Sheet = DialogPrimitive.Root;

function SheetContent({
  title,
  description,
  footer,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof DialogPrimitive.Content>, "title"> & {
  title: React.ReactNode;
  description?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-foreground/40 duration-200 data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
      <DialogPrimitive.Content
        // Without a description Radix wants aria-describedby left out explicitly.
        {...(description ? {} : { "aria-describedby": undefined })}
        className={cn(
          "fixed inset-x-0 bottom-0 z-50 flex max-h-[92dvh] flex-col rounded-t-2xl bg-card text-card-foreground shadow-xl outline-none duration-200",
          "data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0",
          "max-sm:data-open:slide-in-from-bottom max-sm:data-closed:slide-out-to-bottom",
          "sm:inset-auto sm:top-1/2 sm:left-1/2 sm:w-[calc(100%-2rem)] sm:max-w-lg sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-2xl sm:data-open:zoom-in-95 sm:data-closed:zoom-out-95",
          className,
        )}
        {...props}
      >
        <div className="flex items-start gap-2 border-b border-border py-2 pr-2 pl-4">
          <div className="min-w-0 flex-1 py-2">
            <DialogPrimitive.Title className="text-base font-semibold leading-snug">{title}</DialogPrimitive.Title>
            {description ? (
              <DialogPrimitive.Description className="mt-1 text-sm text-muted-foreground">
                {description}
              </DialogPrimitive.Description>
            ) : null}
          </div>
          <DialogPrimitive.Close asChild>
            <Button variant="ghost" size="icon" aria-label="Close">
              <XIcon aria-hidden />
            </Button>
          </DialogPrimitive.Close>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">{children}</div>
        {footer ? (
          <div className="flex flex-col-reverse gap-2 border-t border-border px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:flex-row sm:justify-end">
            {footer}
          </div>
        ) : null}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export { Sheet, SheetContent };
