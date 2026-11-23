import { Check, ChevronRight, CircleCheck, Clock } from "lucide-react";

import { StatusBadge } from "@/components/StatusBadge";
import { Thumb } from "@/components/Thumb";
import { coverImage, lineOptions, lineTitle } from "@/lib/lines";
import type { Line } from "@/lib/types";
import { cn } from "@/lib/utils";

/**
 * Every item of the order as a compact card: a small picture of its artwork preview, its name,
 * colour and sizes, and where it stands. Choosing a card opens that item's review. Phones and
 * tablets show a grid of tiles; wide screens a list beside the review.
 */
export function ItemsOverview({
  lines,
  readOnly,
  selectedId,
  layout,
  onSelect,
}: {
  lines: Line[];
  readOnly: boolean;
  /** The item open in the review beside the list (wide screens only). */
  selectedId: number | null;
  layout: "grid" | "list";
  onSelect: (id: number) => void;
}) {
  return (
    <section aria-labelledby="items-heading" className="space-y-3">
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <h2 id="items-heading" className="text-lg font-semibold">
          Your items <span className="font-normal text-muted-foreground">({lines.length})</span>
        </h2>
        <p className="text-xs text-muted-foreground">{layout === "grid" ? "Tap an item to review it" : "Choose an item to review it"}</p>
      </div>
      <ul className={layout === "grid" ? "grid grid-cols-2 gap-3 sm:grid-cols-3" : "space-y-2.5"}>
        {lines.map((line) => (
          <li key={line.id}>
            <ItemCard
              line={line}
              readOnly={readOnly}
              selected={layout === "list" && line.id === selectedId}
              tile={layout === "grid"}
              onSelect={() => onSelect(line.id)}
            />
          </li>
        ))}
      </ul>
    </section>
  );
}

function ItemCard({
  line,
  readOnly,
  selected,
  tile,
  onSelect,
}: {
  line: Line;
  readOnly: boolean;
  selected: boolean;
  tile: boolean;
  onSelect: () => void;
}) {
  const cover = coverImage(line);
  const meta = lineOptions(line)
    .filter((option) => option.label === "Color" || option.label === "Sizes")
    .map((option) => option.value)
    .join(" · ");

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-current={selected ? "true" : undefined}
      className={cn(
        "group flex w-full rounded-2xl border bg-card p-2.5 text-left transition-[box-shadow,border-color] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        tile ? "h-full flex-col" : "items-center gap-3",
        selected ? "border-foreground shadow-md ring-1 ring-foreground" : "border-border/70 shadow-sm hover:border-input hover:shadow-md",
      )}
    >
      <span
        className={cn(
          "relative flex shrink-0 items-center justify-center overflow-hidden rounded-xl bg-surface",
          tile ? "h-28 w-full" : "size-[88px]",
        )}
      >
        {cover ? (
          <Thumb key={cover} src={cover} alt="" className="bg-transparent p-1.5" />
        ) : line.status === "NO_PROOF_NEEDED" ? (
          <CircleCheck className="size-7 text-muted-foreground" aria-hidden />
        ) : (
          <Clock className="size-7 text-muted-foreground" aria-hidden />
        )}
        {line.status === "APPROVED" ? (
          <span className="absolute top-1.5 right-1.5 flex size-6 items-center justify-center rounded-full bg-success text-success-foreground ring-2 ring-card">
            <Check className="size-3.5" strokeWidth={3} aria-hidden />
          </span>
        ) : null}
      </span>
      <span className={cn("flex min-w-0 flex-1 flex-col gap-1.5", tile ? "px-1 pt-2.5 pb-0.5" : "py-0.5")}>
        <span className="line-clamp-2 text-sm leading-snug font-semibold">{lineTitle(line)}</span>
        {meta ? <span className="truncate text-xs text-muted-foreground">{meta}</span> : null}
        <StatusBadge line={line} readOnly={readOnly} small={tile} className={cn("self-start", tile && "mt-auto")} />
      </span>
      {tile ? null : (
        <ChevronRight
          className={cn("size-4 shrink-0 transition-transform group-hover:translate-x-0.5", selected ? "text-foreground" : "text-muted-foreground")}
          aria-hidden
        />
      )}
    </button>
  );
}
