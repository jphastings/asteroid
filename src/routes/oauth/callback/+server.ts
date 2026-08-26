import { getConfig } from '$lib/server/config';
import { getOAuthClient } from '$lib/server/oauth/client';
import { ensureAccount } from '$lib/server/accounts';
import { ensureSpace } from '$lib/server/spaces';
import {
	createWebSession,
	deleteWebSession,
	WEB_SESSION_COOKIE_NAME,
	webSessionCookieOptions
} from '$lib/server/web-session';
import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const { publicUrl } = getConfig();
	let did: string;
	try {
		const { session } = await getOAuthClient().callback(url.searchParams);
		did = session.did;
		ensureAccount(did);
		await ensureSpace(session);
	} catch (error) {
		console.error('OAuth callback failed', error);
		redirect(303, `${publicUrl}/?error=login`);
	}

	const previousToken = cookies.get(WEB_SESSION_COOKIE_NAME);
	if (previousToken) deleteWebSession(previousToken);
	const token = createWebSession(did);
	cookies.set(WEB_SESSION_COOKIE_NAME, token, webSessionCookieOptions());
	redirect(303, publicUrl);
};
