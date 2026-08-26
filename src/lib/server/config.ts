import { env } from "$env/dynamic/private";

export const SPACE_TYPE = "me.byjp.pebble-index.space";
export const SPACE_SKEY = "main";
export const RECORDING_COLLECTION = "me.byjp.pebble-index.recording";
export const NOTE_COLLECTION = "me.byjp.pebble-index.note";
export const REMINDER_COLLECTION = "me.byjp.pebble-index.reminder";
export const PERMISSION_SET = "me.byjp.pebble-index.auth";

// Base grants: sign-in, audio blob uploads, and CRUD on the two collections in
// the user's PUBLIC repo (for the public webhook).
const BASE_SCOPES = [
  "atproto",
  "blob?accept=audio/mp4",
  `repo:${RECORDING_COLLECTION}`,
  `repo:${NOTE_COLLECTION}`,
];

// The permission-set expands (via published lexicons) to the equivalent of:
//   space:me.byjp.pebble-index.space?authority=self&skey=main
//     &collection=<each collection>&manage=create
// which is also the inline fallback if include: resolution misbehaves.
export const OAUTH_SCOPE = [...BASE_SCOPES, `include:${PERMISSION_SET}`].join(" ");

// For PDSes that reject the spaces permission set (no spaces support yet):
// same grants minus the private space.
export const OAUTH_SCOPE_NO_SPACES = BASE_SCOPES.join(" ");

export function spaceUri(did: string): string {
  return `at://${did}/space/${SPACE_TYPE}/${SPACE_SKEY}`;
}

export type Config = {
  development: boolean;
  publicUrl: string;
  databasePath: string;
  plcUrl: string;
  devIntrospectUrl?: string;
};

type Environment = Record<string, string | undefined>;

export function getConfig(): Config {
  return readConfig(env);
}

export function readConfig(environment: Environment): Config {
  const development = environment.NODE_ENV !== "production";
  return {
    development,
    publicUrl: absoluteUrl("PUBLIC_URL", publicUrlFrom(environment, development)),
    databasePath: environment.DATABASE_PATH ?? "asteroid.db",
    plcUrl: absoluteUrl("PLC_URL", environment.PLC_URL ?? "https://plc.directory"),
    devIntrospectUrl: optionalAbsoluteUrl("DEV_INTROSPECT_URL", environment.DEV_INTROSPECT_URL),
  };
}

function publicUrlFrom(environment: Environment, development: boolean): string {
  // The public URL becomes the OAuth client_id and redirect target, so it must
  // be the address users actually reach the app on.
  if (environment.PUBLIC_URL) return environment.PUBLIC_URL;
  // ORIGIN is adapter-node's own public-address setting.
  if (environment.ORIGIN) return environment.ORIGIN;
  // Railway injects the service's generated domain.
  if (environment.RAILWAY_PUBLIC_DOMAIN) return `https://${environment.RAILWAY_PUBLIC_DOMAIN}`;
  if (development) return "http://127.0.0.1:5173";
  // Never fall back to the dev loopback URL in production: that silently
  // registers a loopback OAuth client and sends users to 127.0.0.1.
  throw new Error(
    "Set PUBLIC_URL (or ORIGIN) to the https address this app is served from, e.g. PUBLIC_URL=https://pebble-index.example.com",
  );
}

export function isLoopbackUrl(value: string): boolean {
  const url = new URL(value);
  return url.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(url.hostname);
}

function absoluteUrl(name: string, value: string): string {
  try {
    return new URL(value).toString().replace(/\/$/, "");
  } catch {
    throw new Error(`${name} must be an absolute URL`);
  }
}

function optionalAbsoluteUrl(name: string, value: string | undefined): string | undefined {
  return value ? absoluteUrl(name, value) : undefined;
}
