// The approval link is <site>#<token>: 64 hex characters after the #. Browsers never
// send the part after # to a server, so the token stays out of every access log. It is
// read from the address bar each time and never stored (no cookies, no localStorage).

const TOKEN = /^[0-9a-f]{64}$/i;

/** The token in the address bar, or null when there is none or it isn't 64 hex characters. */
export function readToken(): string | null {
  const raw = window.location.hash.replace(/^#/, "").trim();
  // Tokens are made in lower case; a mail program that changes the case shouldn't break the link.
  return TOKEN.test(raw) ? raw.toLowerCase() : null;
}

/** A pasted link with another token only changes the hash, so the page listens for that. */
export function subscribeToken(onChange: () => void) {
  window.addEventListener("hashchange", onChange);
  return () => window.removeEventListener("hashchange", onChange);
}

/** The prerendered HTML can't know the token: undefined means "not read yet". */
export const serverToken = () => undefined;
