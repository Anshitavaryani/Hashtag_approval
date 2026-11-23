import { useSyncExternalStore } from "react";

// Tailwind's lg breakpoint: from this width the list of items and the review sit side by side;
// below it the review opens full screen over the list.
const WIDE = "(min-width: 1024px)";

function subscribe(onChange: () => void) {
  const query = window.matchMedia(WIDE);
  query.addEventListener("change", onChange);
  return () => query.removeEventListener("change", onChange);
}

/** True on wide screens. The prerendered page has no window, so it starts as false. */
export const useIsWide = () => useSyncExternalStore(subscribe, () => window.matchMedia(WIDE).matches, () => false);
