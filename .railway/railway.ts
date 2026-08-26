import { defineRailway, github, project, service, volume } from "railway/iac";

// Railway Infrastructure as Code: `railway config plan` / `railway config apply`
// provisions the whole service, including the SQLite volume and env vars.
// (The legacy railway.json in the repo root covers the plain "connect repo in
// the dashboard" flow instead; if you apply this file, delete railway.json.)
export default defineRailway(() => {
  const data = volume("asteroid-data", { sizeMB: 1024 });

  return project("asteroid", {
    resources: [
      service("asteroid", {
        source: github("jphastings/asteroid"),
        build: { builder: "DOCKERFILE", dockerfilePath: "Dockerfile" },
        healthcheck: "/",
        deploy: {
          restartPolicyType: "ON_FAILURE",
          restartPolicyMaxRetries: 10,
          // Volume-attached services can't overlap deployments (Railway stops
          // the old one before starting the new), so a hung deploy means full
          // downtime until this timeout gives up. Default is 300s; this app's
          // healthcheck responds in well under a second when healthy, so a
          // shorter timeout bounds the worst case without risking false fails.
          healthcheckTimeout: 60,
        },
        volumeMounts: {
          // Holds the SQLite database: OAuth sessions and webhook tokens.
          "/data": data,
        },
        env: {
          NODE_ENV: "production",
          DATABASE_PATH: "/data/asteroid.db",
          PLC_URL: "https://plc.directory",
          // PUBLIC_URL is not needed for the generated railway.app domain:
          // the app derives it from Railway's injected RAILWAY_PUBLIC_DOMAIN.
          // Serving from a custom domain? Set PUBLIC_URL: "https://your.domain"
          // here — it becomes the OAuth client_id and redirect target.
        },
      }),
    ],
  });
});
