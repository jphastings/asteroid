import { ScopePermissions } from "@atproto/oauth-scopes";
import { describe, expect, it } from "vitest";
import {
  OAUTH_SCOPE,
  PERMISSION_SET,
  RECORDING_COLLECTION,
  readConfig,
  SPACE_SKEY,
  SPACE_TYPE,
  spaceUri,
} from "./config";

const DID = "did:plc:someone";

describe("config", () => {
  it("parses defaults", () => {
    const config = readConfig({});
    expect(config.publicUrl).toBe("http://127.0.0.1:5173");
    expect(config.databasePath).toBe("asteroid.db");
    expect(config.plcUrl).toBe("https://plc.directory");
    expect(config.devIntrospectUrl).toBeUndefined();
  });

  it("rejects a relative PUBLIC_URL", () => {
    expect(() => readConfig({ PUBLIC_URL: "/nope" })).toThrow(/absolute URL/);
  });

  it("derives PUBLIC_URL from Railway's injected domain", () => {
    const config = readConfig({ RAILWAY_PUBLIC_DOMAIN: "asteroid.up.railway.app" });
    expect(config.publicUrl).toBe("https://asteroid.up.railway.app");
    const explicit = readConfig({
      RAILWAY_PUBLIC_DOMAIN: "asteroid.up.railway.app",
      PUBLIC_URL: "https://asteroid.byjp.me",
    });
    expect(explicit.publicUrl).toBe("https://asteroid.byjp.me");
  });

  it("falls back to adapter-node's ORIGIN before Railway's domain", () => {
    const config = readConfig({
      ORIGIN: "https://pebble-index.byjp.me",
      RAILWAY_PUBLIC_DOMAIN: "asteroid.up.railway.app",
    });
    expect(config.publicUrl).toBe("https://pebble-index.byjp.me");
  });

  it("refuses to default to the dev loopback URL in production", () => {
    expect(() => readConfig({ NODE_ENV: "production" })).toThrow(/PUBLIC_URL/);
    expect(readConfig({ NODE_ENV: "production", PUBLIC_URL: "https://a.example" }).publicUrl).toBe(
      "https://a.example",
    );
  });

  it("builds the space URI", () => {
    expect(spaceUri(DID)).toBe(`at://${DID}/space/${SPACE_TYPE}/${SPACE_SKEY}`);
  });

  it("requests the permission set alongside atproto and blob scopes", () => {
    expect(OAUTH_SCOPE.split(" ")).toEqual([
      "atproto",
      "blob?accept=audio/mp4",
      `include:${PERMISSION_SET}`,
    ]);
  });

  it("the expanded space grant allows what the app does", () => {
    // What include:me.byjp.pebble-index.auth expands to (per lexicons/me/byjp/pebble-index/auth.json)
    // once the PDS resolves the permission set and its `self` authority to the
    // granting user's DID (an unresolved `self` deliberately matches nothing).
    const expanded = [
      "atproto",
      "blob?accept=audio/mp4",
      `space:${SPACE_TYPE}?authority=${DID}&skey=${SPACE_SKEY}&collection=${RECORDING_COLLECTION}&action=read&action=create&action=update&action=delete&manage=create`,
    ].join(" ");
    const permissions = new ScopePermissions(expanded);
    expect(
      permissions.allowsSpace({
        type: SPACE_TYPE,
        authority: DID,
        skey: SPACE_SKEY,
        manage: "create",
      }),
    ).toBe(true);
    expect(
      permissions.allowsSpace({
        type: SPACE_TYPE,
        authority: DID,
        skey: SPACE_SKEY,
        collection: RECORDING_COLLECTION,
        action: "create",
      }),
    ).toBe(true);
  });
});
