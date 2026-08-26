import { buildAtprotoLoopbackClientMetadata } from '@atproto/oauth-client-node';
import { getConfig, OAUTH_SCOPE } from '../config';

export function getClientMetadata() {
	const { publicUrl } = getConfig();
	const appUrl = new URL(publicUrl);
	const redirectUri = `${publicUrl}/oauth/callback`;
	if (appUrl.hostname === 'localhost' || appUrl.hostname === '127.0.0.1') {
		return buildAtprotoLoopbackClientMetadata({
			redirect_uris: [redirectUri],
			scope: OAUTH_SCOPE
		});
	}

	return {
		client_id: `${publicUrl}/oauth-client-metadata.json`,
		client_name: 'Asteroid',
		client_uri: publicUrl,
		redirect_uris: [redirectUri] as [string, ...string[]],
		scope: OAUTH_SCOPE,
		grant_types: ['authorization_code', 'refresh_token'] as ['authorization_code', 'refresh_token'],
		response_types: ['code'] as ['code'],
		token_endpoint_auth_method: 'none' as const,
		application_type: 'web' as const,
		dpop_bound_access_tokens: true
	};
}
