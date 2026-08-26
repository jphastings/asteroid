import { randomBytes } from 'node:crypto';
import type Database from 'better-sqlite3';
import { getDb, type AccountRow } from './db';

const TOKEN_BYTES = 32;

export function newWebhookToken(): string {
	return randomBytes(TOKEN_BYTES).toString('base64url');
}

export function ensureAccount(did: string, db: Database.Database = getDb()): AccountRow {
	db.prepare(
		`INSERT INTO account (did, webhook_token, created_at) VALUES (?, ?, ?)
		 ON CONFLICT (did) DO NOTHING`
	).run(did, newWebhookToken(), new Date().toISOString());
	return getAccount(did, db)!;
}

export function getAccount(did: string, db: Database.Database = getDb()): AccountRow | null {
	return (db.prepare('SELECT * FROM account WHERE did = ?').get(did) as AccountRow) ?? null;
}

export function accountForToken(
	token: string,
	db: Database.Database = getDb()
): AccountRow | null {
	if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
	return (
		(db.prepare('SELECT * FROM account WHERE webhook_token = ?').get(token) as AccountRow) ?? null
	);
}

export function rotateWebhookToken(did: string, db: Database.Database = getDb()): string {
	const token = newWebhookToken();
	db.prepare('UPDATE account SET webhook_token = ? WHERE did = ?').run(token, did);
	return token;
}

export function setSpaceUri(did: string, uri: string, db: Database.Database = getDb()): void {
	db.prepare('UPDATE account SET space_uri = ? WHERE did = ?').run(uri, did);
}

export function recordWebhookResult(
	did: string,
	status: string,
	db: Database.Database = getDb()
): void {
	db.prepare('UPDATE account SET last_webhook_at = ?, last_webhook_status = ? WHERE did = ?').run(
		new Date().toISOString(),
		status,
		did
	);
}
