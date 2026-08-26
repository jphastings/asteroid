import { randomBytes } from "node:crypto";
import type Database from "better-sqlite3";
import { getDb, type AccountRow } from "./db";

const TOKEN_BYTES = 32;
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type WebhookKind = "private" | "public";

export function newWebhookToken(): string {
  return randomBytes(TOKEN_BYTES).toString("base64url");
}

export function ensureAccount(did: string, db: Database.Database = getDb()): AccountRow {
  db.prepare(
    `INSERT INTO account (did, webhook_token, public_webhook_token, created_at) VALUES (?, ?, ?, ?)
		 ON CONFLICT (did) DO NOTHING`,
  ).run(did, newWebhookToken(), newWebhookToken(), new Date().toISOString());
  // Accounts created before the public webhook existed get one on next login.
  db.prepare(
    "UPDATE account SET public_webhook_token = ? WHERE did = ? AND public_webhook_token IS NULL",
  ).run(newWebhookToken(), did);
  return getAccount(did, db)!;
}

export function getAccount(did: string, db: Database.Database = getDb()): AccountRow | null {
  return (db.prepare("SELECT * FROM account WHERE did = ?").get(did) as AccountRow) ?? null;
}

export function accountForToken(
  token: string,
  db: Database.Database = getDb(),
): { account: AccountRow; hook: WebhookKind } | null {
  if (!TOKEN_PATTERN.test(token)) return null;
  const byPrivate = db.prepare("SELECT * FROM account WHERE webhook_token = ?").get(token) as
    | AccountRow
    | undefined;
  if (byPrivate) return { account: byPrivate, hook: "private" };
  const byPublic = db.prepare("SELECT * FROM account WHERE public_webhook_token = ?").get(token) as
    | AccountRow
    | undefined;
  if (byPublic) return { account: byPublic, hook: "public" };
  return null;
}

export function rotateWebhookToken(
  did: string,
  hook: WebhookKind,
  db: Database.Database = getDb(),
): string {
  const token = newWebhookToken();
  const column = hook === "public" ? "public_webhook_token" : "webhook_token";
  db.prepare(`UPDATE account SET ${column} = ? WHERE did = ?`).run(token, did);
  return token;
}

export function setSpaceUri(did: string, uri: string, db: Database.Database = getDb()): void {
  db.prepare("UPDATE account SET space_uri = ? WHERE did = ?").run(uri, did);
}

export function setSpacesSupported(
  did: string,
  supported: boolean,
  db: Database.Database = getDb(),
): void {
  db.prepare("UPDATE account SET spaces_supported = ? WHERE did = ?").run(supported ? 1 : 0, did);
}

export function recordWebhookResult(
  did: string,
  status: string,
  db: Database.Database = getDb(),
): void {
  db.prepare("UPDATE account SET last_webhook_at = ?, last_webhook_status = ? WHERE did = ?").run(
    new Date().toISOString(),
    status,
    did,
  );
}
