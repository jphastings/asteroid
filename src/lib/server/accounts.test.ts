import { describe, expect, it } from 'vitest';
import { accountForToken, ensureAccount, rotateWebhookToken } from './accounts';
import { openDb } from './db';

const DID = 'did:plc:someone';

describe('accounts', () => {
	it('creates an account with a webhook token once', () => {
		const db = openDb(':memory:');
		const account = ensureAccount(DID, db);
		expect(account.webhook_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
		expect(ensureAccount(DID, db).webhook_token).toBe(account.webhook_token);
	});

	it('looks accounts up by webhook token', () => {
		const db = openDb(':memory:');
		const account = ensureAccount(DID, db);
		expect(accountForToken(account.webhook_token, db)?.did).toBe(DID);
		expect(accountForToken('A'.repeat(43), db)).toBeNull();
		expect(accountForToken('nope', db)).toBeNull();
	});

	it('rotates the webhook token', () => {
		const db = openDb(':memory:');
		const account = ensureAccount(DID, db);
		const rotated = rotateWebhookToken(DID, db);
		expect(rotated).not.toBe(account.webhook_token);
		expect(accountForToken(account.webhook_token, db)).toBeNull();
		expect(accountForToken(rotated, db)?.did).toBe(DID);
	});
});
