// Production entry point. Sets adapter-node's ORIGIN (which it uses to resolve
// request URLs behind a reverse proxy) from PUBLIC_URL or Railway's injected
// domain before starting the built server.
if (!process.env.ORIGIN) {
  const origin =
    process.env.PUBLIC_URL ??
    (process.env.RAILWAY_PUBLIC_DOMAIN
      ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}`
      : undefined);
  if (origin) process.env.ORIGIN = new URL(origin).origin;
}

await import("./build/index.js");
