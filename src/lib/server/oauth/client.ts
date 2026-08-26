import {
	NodeOAuthClient,
	type AtprotoDid,
	type NodeSavedSession,
	type NodeSavedState,
	type OAuthSession
} from '@atproto/oauth-client-node';
import { isIP } from 'node:net';
import { getConfig } from '../config';
import { getDb } from '../db';
import { resolveHandle } from '../identity';
import { getClientMetadata } from './metadata';

let oauthClient: NodeOAuthClient | undefined;

export function getOAuthClient(): NodeOAuthClient {
	if (oauthClient) return oauthClient;
	const config = getConfig();

	oauthClient = new NodeOAuthClient({
		clientMetadata: getClientMetadata(),
		allowHttp: isLoopbackApp(config.publicUrl),
		plcDirectoryUrl: config.plcUrl,
		handleResolver: {
			async resolve(handle) {
				return (await resolveHandle(handle)) as AtprotoDid | null;
			}
		},
		stateStore: sqliteStore<NodeSavedState>('auth_state'),
		sessionStore: sqliteStore<NodeSavedSession>('auth_session')
	});

	return oauthClient;
}

/**
 * Restore (and, when needed, refresh) the stored OAuth session for a DID.
 * This is what lets the webhook write to the user's PDS while they're offline.
 */
export async function restoreSession(did: string): Promise<OAuthSession> {
	const session = await getOAuthClient().restore(did as AtprotoDid);
	if (session.did !== did) throw new Error('Restored session DID mismatch');
	return session;
}

function isLoopbackApp(publicUrl: string): boolean {
	const hostname = new URL(publicUrl).hostname;
	const unwrapped = hostname.replace(/^\[|\]$/g, '');
	return (
		hostname === 'localhost' ||
		unwrapped === '::1' ||
		(isIP(unwrapped) === 4 && unwrapped.startsWith('127.'))
	);
}

function sqliteStore<T>(table: 'auth_state' | 'auth_session') {
	return {
		async get(key: string): Promise<T | undefined> {
			const row = getDb().prepare(`SELECT value FROM ${table} WHERE key = ?`).get(key) as
				| { value: string }
				| undefined;
			return row ? (JSON.parse(row.value) as T) : undefined;
		},
		async set(key: string, value: T): Promise<void> {
			getDb()
				.prepare(
					`INSERT INTO ${table} (key, value) VALUES (?, ?)
					 ON CONFLICT (key) DO UPDATE SET value = excluded.value`
				)
				.run(key, JSON.stringify(value));
		},
		async del(key: string): Promise<void> {
			getDb().prepare(`DELETE FROM ${table} WHERE key = ?`).run(key);
		}
	};
}
