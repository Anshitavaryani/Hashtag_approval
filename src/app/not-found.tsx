import type { Metadata } from "next";
import { SearchX } from "lucide-react";

import { SiteFooter, SiteHeader } from "@/components/SiteChrome";

export const metadata: Metadata = { title: "Page not found" };

export default function NotFound() {
  return (
    <div className="flex min-h-dvh flex-col">
      <SiteHeader />
      <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
          <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-ink ring-1 ring-primary">
            <SearchX className="size-6" aria-hidden />
          </div>
          <h1 className="text-xl font-semibold">Page not found</h1>
          <p className="max-w-sm text-sm leading-relaxed text-muted-foreground">
            To review your artwork, open the link in the email we sent you.
          </p>
        </div>
      </main>
      <SiteFooter />
    </div>
  );
}
