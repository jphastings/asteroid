import { env } from "$env/dynamic/private";

export const SPACE_TYPE = "me.byjp.pebble-index.space";
export const SPACE_SKEY = "self";
export const RECORDING_COLLECTION = "me.byjp.pebble-index.recording";
export const PERMISSION_SET = "me.byjp.pebble-index.auth";

// The permission-set expands (via published lexicons) to the equivalent of:
//   space:me.byjp.pebble-index.space?authority=self&skey=self
//     &collection=me.byjp.pebble-index.recording&manage=create
// which is also the inline fallback if include: resolution misbehaves.
export const OAUTH_SCOPE = ["atproto", "blob?accept=audio/mp4", `include:${PERMISSION_SET}`].join(
  " ",
);

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
  return {
    development: environment.NODE_ENV !== "production",
    publicUrl: absoluteUrl("PUBLIC_URL", environment.PUBLIC_URL ?? defaultPublicUrl(environment)),
    databasePath: environment.DATABASE_PATH ?? "asteroid.db",
    plcUrl: absoluteUrl("PLC_URL", environment.PLC_URL ?? "https://plc.directory"),
    devIntrospectUrl: optionalAbsoluteUrl("DEV_INTROSPECT_URL", environment.DEV_INTROSPECT_URL),
  };
}

function defaultPublicUrl(environment: Environment): string {
  // On Railway, the service's generated (or custom) domain is injected as
  // RAILWAY_PUBLIC_DOMAIN, so no PUBLIC_URL configuration is needed there.
  if (environment.RAILWAY_PUBLIC_DOMAIN) return `https://${environment.RAILWAY_PUBLIC_DOMAIN}`;
  return "http://127.0.0.1:5173";
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
