import { getClientMetadata } from '$lib/server/oauth/metadata';
import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = () => {
	return json(getClientMetadata());
};
