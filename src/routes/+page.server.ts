import { getAccount, rotateWebhookToken } from "$lib/server/accounts";
import { getConfig, OAUTH_SCOPE, OAUTH_SCOPE_NO_SPACES } from "$lib/server/config";
import { getOAuthClient, restoreSession } from "$lib/server/oauth/client";
import { deleteEntry, listEntries, type EntryView } from "$lib/server/spaces";
import {
  deleteWebSession,
  deleteWebSessionsForDid,
  WEB_SESSION_COOKIE_NAME,
} from "$lib/server/web-session";
import { fail, redirect } from "@sveltejs/kit";
import type { Actions, PageServerLoad } from "./$types";

export type DashboardData = {
  loggedIn: boolean;
  handleError?: string;
  sessionError?: string;
  spacesSupported?: boolean;
  privateWebhookUrl?: string;
  publicWebhookUrl?: string;
  lastWebhookAt?: string | null;
  lastWebhookStatus?: string | null;
  entries?: EntryView[];
};

export const load: PageServerLoad = async ({ locals, cookies }): Promise<DashboardData> => {
  if (!locals.did) return { loggedIn: false };

  const account = getAccount(locals.did);
  if (!account) {
    clearSession(cookies);
    return { loggedIn: false };
  }

  const spacesSupported = account.spaces_supported === 1;
  let entries: EntryView[];
  try {
    const session = await restoreSession(locals.did);
    ({ entries } = await listEntries(session, { includePrivate: spacesSupported }));
  } catch (error) {
    console.error("Could not load entries", error);
    clearSession(cookies);
    return {
      loggedIn: false,
      sessionError: "Your session has expired — please sign in again.",
    };
  }

  const { publicUrl } = getConfig();
  return {
    loggedIn: true,
    spacesSupported,
    privateWebhookUrl: spacesSupported ? `${publicUrl}/hook/${account.webhook_token}` : undefined,
    publicWebhookUrl: account.public_webhook_token
      ? `${publicUrl}/hook/${account.public_webhook_token}`
      : undefined,
    lastWebhookAt: account.last_webhook_at,
    lastWebhookStatus: account.last_webhook_status,
    entries,
  };
};

export const actions: Actions = {
  login: async ({ request }) => {
    const form = await request.formData();
    const handle = String(form.get("handle") ?? "")
      .trim()
      .replace(/^@/, "");
    if (!handle) return fail(400, { handleError: "Enter your handle" });

    let url: URL;
    try {
      url = await getOAuthClient().authorize(handle, { scope: OAUTH_SCOPE });
    } catch (firstError) {
      // A PDS without spaces support may refuse the spaces permission set
      // outright; retry with the space-free scope before giving up.
      try {
        url = await getOAuthClient().authorize(handle, { scope: OAUTH_SCOPE_NO_SPACES });
      } catch (error) {
        console.error("Could not start sign-in", firstError, error);
        return fail(500, {
          handleError: "We couldn’t sign you in. Check the handle and try again.",
        });
      }
    }
    redirect(303, url.toString());
  },

  logout: async ({ cookies }) => {
    const token = cookies.get(WEB_SESSION_COOKIE_NAME);
    const did = token ? deleteWebSession(token) : null;
    if (did) {
      await getOAuthClient()
        .revoke(did)
        .catch(() => undefined);
      deleteWebSessionsForDid(did);
    }
    cookies.delete(WEB_SESSION_COOKIE_NAME, { path: "/" });
    redirect(303, "/");
  },

  rotateToken: async ({ request, locals }) => {
    if (!locals.did) return fail(401);
    const form = await request.formData();
    const hook = form.get("hook") === "public" ? "public" : "private";
    rotateWebhookToken(locals.did, hook);
    redirect(303, "/");
  },

  deleteEntry: async ({ request, locals }) => {
    if (!locals.did) return fail(401);
    const form = await request.formData();
    const visibility = form.get("visibility") === "public" ? "public" : "private";
    const collection = String(form.get("collection") ?? "");
    const rkey = String(form.get("rkey") ?? "");
    if (!collection.startsWith("me.byjp.pebble-index.") || !rkey) return fail(400);

    try {
      const session = await restoreSession(locals.did);
      await deleteEntry(session, { visibility, collection, rkey });
    } catch (error) {
      console.error("Could not delete entry", error);
      return fail(500, { deleteError: "Could not delete that entry — try again." });
    }
    redirect(303, "/");
  },
};

function clearSession(cookies: {
  get: (name: string) => string | undefined;
  delete: (name: string, opts: { path: string }) => void;
}) {
  const token = cookies.get(WEB_SESSION_COOKIE_NAME);
  if (token) deleteWebSession(token);
  cookies.delete(WEB_SESSION_COOKIE_NAME, { path: "/" });
}
