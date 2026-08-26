import { getAccount, rotateWebhookToken } from '$lib/server/accounts';
import { getConfig, OAUTH_SCOPE } from '$lib/server/config';
import { getOAuthClient, restoreSession } from '$lib/server/oauth/client';
import { listRecordings, type RecordingView } from '$lib/server/spaces';
import {
	deleteWebSession,
	deleteWebSessionsForDid,
	WEB_SESSION_COOKIE_NAME
} from '$lib/server/web-session';
import { fail, redirect } from '@sveltejs/kit';
import type { Actions, PageServerLoad } from './$types';

export type DashboardData = {
	loggedIn: boolean;
	handleError?: string;
	sessionError?: string;
	webhookUrl?: string;
	lastWebhookAt?: string | null;
	lastWebhookStatus?: string | null;
	recordings?: RecordingView[];
};

export const load: PageServerLoad = async ({ locals, cookies }): Promise<DashboardData> => {
	if (!locals.did) return { loggedIn: false };

	const account = getAccount(locals.did);
	if (!account) {
		clearSession(cookies);
		return { loggedIn: false };
	}

	let recordings: RecordingView[];
	try {
		const session = await restoreSession(locals.did);
		({ recordings } = await listRecordings(session));
	} catch (error) {
		console.error('Could not load recordings', error);
		clearSession(cookies);
		return {
			loggedIn: false,
			sessionError: 'Your session has expired — please sign in again.'
		};
	}

	return {
		loggedIn: true,
		webhookUrl: `${getConfig().publicUrl}/hook/${account.webhook_token}`,
		lastWebhookAt: account.last_webhook_at,
		lastWebhookStatus: account.last_webhook_status,
		recordings
	};
};

export const actions: Actions = {
	login: async ({ request }) => {
		const form = await request.formData();
		const handle = String(form.get('handle') ?? '')
			.trim()
			.replace(/^@/, '');
		if (!handle) return fail(400, { handleError: 'Enter your handle' });

		let url: URL;
		try {
			url = await getOAuthClient().authorize(handle, { scope: OAUTH_SCOPE });
		} catch (error) {
			console.error('Could not start sign-in', error);
			return fail(500, {
				handleError: 'We couldn’t sign you in. Check the handle and try again.'
			});
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
		cookies.delete(WEB_SESSION_COOKIE_NAME, { path: '/' });
		redirect(303, '/');
	},

	rotateToken: async ({ locals }) => {
		if (!locals.did) return fail(401);
		rotateWebhookToken(locals.did);
		redirect(303, '/');
	}
};

function clearSession(cookies: { get: (name: string) => string | undefined; delete: (name: string, opts: { path: string }) => void }) {
	const token = cookies.get(WEB_SESSION_COOKIE_NAME);
	if (token) deleteWebSession(token);
	cookies.delete(WEB_SESSION_COOKIE_NAME, { path: '/' });
}
