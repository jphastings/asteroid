import Database from 'better-sqlite3';
import { getConfig } from './config';

const migrations: string[] = [
	`
	CREATE TABLE auth_state (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	) STRICT;
	CREATE TABLE auth_session (
		key   TEXT PRIMARY KEY,
		value TEXT NOT NULL
	) STRICT;
	CREATE TABLE web_session (
		token_hash TEXT PRIMARY KEY,
		did        TEXT NOT NULL,
		created_at TEXT NOT NULL,
		expires_at TEXT NOT NULL
	) STRICT;
	CREATE INDEX web_session_did ON web_session (did);
	CREATE TABLE account (
		did                 TEXT PRIMARY KEY,
		webhook_token       TEXT NOT NULL UNIQUE,
		space_uri           TEXT,
		created_at          TEXT NOT NULL,
		last_webhook_at     TEXT,
		last_webhook_status TEXT
	) STRICT;
	`
];

export type AccountRow = {
	did: string;
	webhook_token: string;
	space_uri: string | null;
	created_at: string;
	last_webhook_at: string | null;
	last_webhook_status: string | null;
};

let db: Database.Database | undefined;

export function getDb(): Database.Database {
	db ??= openDb(getConfig().databasePath);
	return db;
}

export function openDb(path: string): Database.Database {
	const database = new Database(path);
	database.pragma('journal_mode = WAL');
	database.pragma('foreign_keys = ON');
	migrate(database);
	return database;
}

function migrate(database: Database.Database): void {
	const version = database.pragma('user_version', { simple: true }) as number;
	for (let index = version; index < migrations.length; index++) {
		database.transaction(() => {
			database.exec(migrations[index]);
			database.pragma(`user_version = ${index + 1}`);
		})();
	}
}
