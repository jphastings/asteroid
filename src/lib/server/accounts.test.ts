import { describe, expect, it } from "vitest";
import { accountForToken, ensureAccount, rotateWebhookToken } from "./accounts";
import { openDb } from "./db";

const DID = "did:plc:someone";

describe("accounts", () => {
  it("creates an account with distinct private and public webhook tokens", () => {
    const db = openDb(":memory:");
    const account = ensureAccount(DID, db);
    expect(account.webhook_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(account.public_webhook_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    expect(account.public_webhook_token).not.toBe(account.webhook_token);
    expect(ensureAccount(DID, db).webhook_token).toBe(account.webhook_token);
  });

  it("looks accounts up by either webhook token, reporting which hook matched", () => {
    const db = openDb(":memory:");
    const account = ensureAccount(DID, db);
    expect(accountForToken(account.webhook_token, db)).toMatchObject({
      hook: "private",
      account: { did: DID },
    });
    expect(accountForToken(account.public_webhook_token!, db)).toMatchObject({
      hook: "public",
      account: { did: DID },
    });
    expect(accountForToken("A".repeat(43), db)).toBeNull();
    expect(accountForToken("nope", db)).toBeNull();
  });

  it("rotates each webhook token independently", () => {
    const db = openDb(":memory:");
    const account = ensureAccount(DID, db);
    const rotated = rotateWebhookToken(DID, "private", db);
    expect(rotated).not.toBe(account.webhook_token);
    expect(accountForToken(account.webhook_token, db)).toBeNull();
    expect(accountForToken(rotated, db)?.hook).toBe("private");
    expect(accountForToken(account.public_webhook_token!, db)?.hook).toBe("public");

    const rotatedPublic = rotateWebhookToken(DID, "public", db);
    expect(accountForToken(account.public_webhook_token!, db)).toBeNull();
    expect(accountForToken(rotatedPublic, db)?.hook).toBe("public");
    expect(accountForToken(rotated, db)?.hook).toBe("private");
  });

  it("backfills a public token for accounts created before it existed", () => {
    const db = openDb(":memory:");
    ensureAccount(DID, db);
    db.prepare("UPDATE account SET public_webhook_token = NULL WHERE did = ?").run(DID);
    const account = ensureAccount(DID, db);
    expect(account.public_webhook_token).toMatch(/^[A-Za-z0-9_-]{43}$/);
  });
});
