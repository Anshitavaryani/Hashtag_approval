/**
 * How a customer action ended, for the part of the page that started it:
 * done, conflict (the page was refreshed from the API's answer), failed (with a
 * message to show), or skipped (another action was still running).
 */
export type Outcome = { status: "done" | "conflict" | "failed" | "skipped"; message?: string };
