import type { ReactNode } from "react";
import { Link2Off, RefreshCw, WifiOff } from "lucide-react";

import { Button } from "@/components/ui/button";

function Notice({ icon, title, children }: { icon: ReactNode; title: string; children: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 py-10 sm:py-16">
      <div className="flex flex-col items-center gap-4 rounded-2xl border border-border/70 bg-card px-6 py-12 text-center shadow-sm">
        <div className="flex size-14 items-center justify-center rounded-full bg-primary-soft text-primary-ink ring-1 ring-primary">{icon}</div>
        <h1 className="text-xl font-semibold">{title}</h1>
        <div className="max-w-sm space-y-3 text-sm leading-relaxed text-muted-foreground">{children}</div>
      </div>
    </main>
  );
}

const pulse = "animate-pulse rounded bg-muted";

/** While the page loads: the shape of the summary and the item cards, without content. */
export function LoadingScreen() {
  return (
    <main aria-busy="true" className="mx-auto w-full max-w-[1200px] flex-1 space-y-6 px-4 py-5 sm:px-6 lg:py-6">
      <p role="status" className="sr-only">
        Loading your artwork…
      </p>
      <div className="grid gap-6 rounded-2xl border border-border/70 bg-card p-5 shadow-sm sm:p-7 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="space-y-3">
          <div className={`h-3 w-48 ${pulse}`} />
          <div className={`h-9 w-72 max-w-full ${pulse}`} />
          <div className={`h-4 w-full max-w-md ${pulse}`} />
        </div>
        <div className={`h-32 rounded-xl ${pulse}`} />
      </div>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="space-y-2.5 rounded-2xl border border-border/70 bg-card p-2.5">
            <div className={`h-28 rounded-xl ${pulse}`} />
            <div className={`h-4 w-3/4 ${pulse}`} />
            <div className={`h-5 w-24 rounded-full ${pulse}`} />
          </div>
        ))}
      </div>
    </main>
  );
}

/** No key in the address, or the API doesn't know it (replaced, switched off, order deleted). */
export function InvalidLinkScreen({ missing, message }: { missing: boolean; message: string }) {
  return (
    <Notice icon={<Link2Off className="size-6" aria-hidden />} title={missing ? "This link isn't complete" : "This link can't be used"}>
      <p>
        {missing
          ? "Please open the link in the email we sent you again. If you copied it by hand, part of it may be missing."
          : message}
      </p>
      <p>To get a new link, reply to the email we sent you.</p>
    </Notice>
  );
}

export function LoadErrorScreen({ message, canRetry, onRetry }: { message: string; canRetry: boolean; onRetry: () => void }) {
  return (
    <Notice icon={<WifiOff className="size-6" aria-hidden />} title="We couldn't load your artwork">
      <p role="alert">{message}</p>
      {canRetry ? (
        <Button onClick={onRetry} className="mt-2">
          <RefreshCw aria-hidden />
          Try again
        </Button>
      ) : null}
    </Notice>
  );
}
