"use client";

import { RefreshCw, TriangleAlert } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";
import { Button } from "@/components/ui/button";

// If drawing the page ever fails, the customer gets a way out instead of a blank screen.
export default function ErrorPage({ reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-ink ring-1 ring-primary">
            <TriangleAlert className="size-6" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Something went wrong</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            We couldn&apos;t show your artwork. Please try again, or reload the page.
          </p>
          <Button onClick={reset} className="mt-2">
            <RefreshCw aria-hidden />
            Try again
          </Button>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
