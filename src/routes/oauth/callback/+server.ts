import { ensureAccount, setSpacesSupported } from "$lib/server/accounts";
import { getConfig, PERMISSION_SET } from "$lib/server/config";
import { getOAuthClient } from "$lib/server/oauth/client";
import { ensureSpace, isSpacesUnsupportedError } from "$lib/server/spaces";
import {
  createWebSession,
  deleteWebSession,
  WEB_SESSION_COOKIE_NAME,
  webSessionCookieOptions,
} from "$lib/server/web-session";
import type { OAuthSession } from "@atproto/oauth-client-node";
import { redirect } from "@sveltejs/kit";
import type { RequestHandler } from "./$types";

export const GET: RequestHandler = async ({ url, cookies }) => {
  const { publicUrl } = getConfig();
  let did: string;
  try {
    const { session } = await getOAuthClient().callback(url.searchParams);
    did = session.did;
    ensureAccount(did);
    setSpacesSupported(did, await checkSpacesSupport(session));
  } catch (error) {
    console.error("OAuth callback failed", error);
    redirect(303, `${publicUrl}/?error=login`);
  }

  const previousToken = cookies.get(WEB_SESSION_COOKIE_NAME);
  if (previousToken) deleteWebSession(previousToken);
  const token = createWebSession(did);
  cookies.set(WEB_SESSION_COOKIE_NAME, token, webSessionCookieOptions());
  redirect(303, publicUrl);
};

/**
 * A PDS without spaces support either refused the spaces permission set at
 * authorize time (so the granted scope lacks it) or rejects the space XRPC
 * methods; both mean the private webhook can't work for this account.
 */
async function checkSpacesSupport(session: OAuthSession): Promise<boolean> {
  const { scope } = await session.getTokenInfo(false);
  if (!scope?.includes(`include:${PERMISSION_SET}`) && !scope?.includes("space:")) return false;
  try {
    await ensureSpace(session);
    return true;
  } catch (error) {
    if (isSpacesUnsupportedError(error)) return false;
    throw error;
  }
}
