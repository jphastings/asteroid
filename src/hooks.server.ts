import { getConfig } from "$lib/server/config";
import { resolveWebSession, WEB_SESSION_COOKIE_NAME } from "$lib/server/web-session";
import { error, type Handle } from "@sveltejs/kit";

const FORM_CONTENT_TYPES = [
  "application/x-www-form-urlencoded",
  "multipart/form-data",
  "text/plain",
];
const MUTATING_METHODS = ["POST", "PUT", "PATCH", "DELETE"];

/**
 * SvelteKit's built-in CSRF origin check is disabled in vite.config.ts because
 * the Pebble app's webhook POST is a cross-site multipart request with no
 * Origin header. This reimplements the same check for everything except
 * /hook/* (which is authenticated by its secret URL instead).
 */
function assertSameOrigin(request: Request, url: URL): void {
  if (url.pathname.startsWith("/hook/")) return;
  if (!MUTATING_METHODS.includes(request.method)) return;
  const contentType = request.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase();
  if (!contentType || !FORM_CONTENT_TYPES.includes(contentType)) return;
  // Compare against the configured public URL, not the resolved request URL:
  // behind a reverse proxy the latter is only right when ORIGIN is also set.
  const expected = new URL(getConfig().publicUrl).origin;
  if (request.headers.get("origin") !== expected) {
    error(
      403,
      `Cross-site ${request.method} form submissions are forbidden: this app is configured for ${expected} — sign in there, or update PUBLIC_URL if that is not the address it is served from`,
    );
  }
}

export const handle: Handle = async ({ event, resolve }) => {
  if (!getConfig().development) assertSameOrigin(event.request, event.url);

  const token = event.cookies.get(WEB_SESSION_COOKIE_NAME);
  event.locals.did = token ? resolveWebSession(token) : null;

  return resolve(event);
};
