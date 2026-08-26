import { accountForToken, recordWebhookResult } from '$lib/server/accounts';
import { restoreSession } from '$lib/server/oauth/client';
import { writeRecording } from '$lib/server/spaces';
import { parseRingWebhook, WebhookParseError } from '$lib/server/webhook';
import { error, text } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const POST: RequestHandler = async ({ params, request }) => {
	const account = accountForToken(params.token);
	if (!account) error(404, 'Not found');

	let webhook;
	try {
		webhook = await parseRingWebhook(request);
	} catch (cause) {
		if (cause instanceof WebhookParseError) {
			recordWebhookResult(account.did, `error: ${cause.message}`);
			error(400, cause.message);
		}
		throw cause;
	}

	if (webhook.test) {
		recordWebhookResult(account.did, 'test');
		return text('OK');
	}

	try {
		const session = await restoreSession(account.did);
		const { duplicate } = await writeRecording(session, webhook);
		recordWebhookResult(account.did, duplicate ? 'ok (duplicate)' : 'ok');
	} catch (cause) {
		console.error('Webhook delivery failed', cause);
		const message = cause instanceof Error ? cause.message : String(cause);
		recordWebhookResult(account.did, `error: ${message}`);
		// A 5xx makes the Pebble app retry alongside the next recording.
		error(500, 'Could not store the recording');
	}

	return text('OK');
};
