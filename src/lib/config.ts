// Build-time settings (README.md, "Environment"). Next inlines NEXT_PUBLIC_ values into the page.

/** The backend API root with a trailing slash, e.g. https://node.hashtagbillionaire.com/api/v1/. Empty when unset. */
export const API_URL = (process.env.NEXT_PUBLIC_API_URL ?? "").trim().replace(/\/*$/, "/").replace(/^\/$/, "");
