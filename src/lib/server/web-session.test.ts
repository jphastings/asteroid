import { describe, expect, it } from 'vitest';
import { openDb } from './db';
import { createWebSession, deleteWebSession, resolveWebSession } from './web-session';

const DID = 'did:plc:someone';

describe('web sessions', () => {
	it('round-trips a session token', () => {
		const db = openDb(':memory:');
		const token = createWebSession(DID, db);
		expect(token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(resolveWebSession(token, db)).toBe(DID);
	});

	it('rejects malformed and unknown tokens', () => {
		const db = openDb(':memory:');
		createWebSession(DID, db);
		expect(resolveWebSession('not-a-token', db)).toBeNull();
		expect(resolveWebSession('A'.repeat(43), db)).toBeNull();
	});

	it('deletes sessions and reports the DID they belonged to', () => {
		const db = openDb(':memory:');
		const token = createWebSession(DID, db);
		expect(deleteWebSession(token, db)).toBe(DID);
		expect(resolveWebSession(token, db)).toBeNull();
		expect(deleteWebSession(token, db)).toBeNull();
	});

	it('stores only a hash of the token', () => {
		const db = openDb(':memory:');
		const token = createWebSession(DID, db);
		const rows = db.prepare('SELECT token_hash FROM web_session').all() as {
			token_hash: string;
		}[];
		expect(rows).toHaveLength(1);
		expect(rows[0].token_hash).not.toBe(token);
	});
});
