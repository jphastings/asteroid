import { restoreSession } from '$lib/server/oauth/client';
import { AUDIO_MIME_TYPE, getAudioBlob } from '$lib/server/spaces';
import { error } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ params, locals }) => {
	if (!locals.did) error(401, 'Sign in first');
	if (!/^[a-z2-7]{8,256}$/.test(params.cid)) error(400, 'Invalid cid');

	let bytes: Uint8Array;
	try {
		const session = await restoreSession(locals.did);
		bytes = await getAudioBlob(session, params.cid);
	} catch (cause) {
		console.error('Audio fetch failed', cause);
		error(404, 'Audio not found');
	}

	return new Response(new Uint8Array(bytes), {
		headers: {
			'content-type': AUDIO_MIME_TYPE,
			// Content-addressed and private to the signed-in owner.
			'cache-control': 'private, max-age=31536000, immutable',
			'x-content-type-options': 'nosniff'
		}
	});
};
