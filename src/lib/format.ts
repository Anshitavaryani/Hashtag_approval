// Times show in the viewer's own time zone, with its abbreviation (e.g. "Nov 21, 2026, 2:05 PM CST").
const timeFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZoneName: "short",
});

const dateFormat = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" });

// The API sends UTC. A time without a zone ("2026-11-21 20:05:00") is read as UTC too:
// Safari can't parse the space form at all, and other browsers would read it as local time.
function toDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const utc = /^\d{4}-\d{2}-\d{2}[ T]\d{2}:\d{2}(:\d{2}(\.\d+)?)?$/.test(value) ? `${value.replace(" ", "T")}Z` : value;
  const date = new Date(utc);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function formatTime(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? timeFormat.format(date) : "";
}

export function formatDate(value: string | null | undefined): string {
  const date = toDate(value);
  return date ? dateFormat.format(date) : "";
}

/** For <time dateTime>: a valid ISO string, or undefined. */
export function isoTime(value: string | null | undefined): string | undefined {
  return toDate(value)?.toISOString();
}

const NAMED: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: "\u00a0" };

/** Product data can hold HTML entities ("Men&#39;s Tee"). Decoded once, as text: React still escapes it. */
export function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-f]+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === "#") {
      const n = code[1] === "x" || code[1] === "X" ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      return n > 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return NAMED[code.toLowerCase()] ?? match;
  });
}

/** "LEFT_CHEST" → "Left chest", "SCREEN_PRINT" → "Screen print"; short codes such as DTF stay as they are. */
export function prettyOption(value: string): string {
  const text = decodeEntities(value).replace(/_/g, " ").trim();
  if (text.length > 3 && text === text.toUpperCase() && /[A-Z]/.test(text)) {
    return text.charAt(0) + text.slice(1).toLowerCase();
  }
  return text;
}
