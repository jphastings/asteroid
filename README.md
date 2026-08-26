# ☄️ asteroid

An [atproto spaces](https://atproto.com/blog/atproto-spaces-alpha)–native receiver for [Pebble Index](https://repebble.com/index)'s audio-note webhooks.

Sign in with your Atmosphere account (on a spaces-enabled PDS), paste your secret webhook URL into the Pebble app, and every recording your ring captures — audio, transcription, or both — lands as a `me.byjp.pebble-index.recording` record in a private space on **your own PDS**, with the audio stored as a blob alongside it. The app then reads your space back to list and play your recordings.

## How it works

- **Login** is atproto OAuth (`@atproto/oauth-client-node`). The granted scope is `atproto blob?accept=audio/mp4 include:me.byjp.pebble-index.auth` — the permission set expands to full access to your own `me.byjp.pebble-index.space` space plus blob uploads. OAuth sessions are stored server-side (SQLite) so the webhook can write to your PDS while you're away.
- **First login** creates a private space at `at://<your-did>/space/me.byjp.pebble-index.space/self` (`com.atproto.simplespace.createSpace` with an empty member list — nobody but you can read it).
- **The webhook** (`POST /hook/<secret-token>`) accepts the Pebble Index multipart payload ([format docs](https://github.com/coredevices/mobileapp/blob/master/experimental/src/commonMain/kotlin/coredevices/ring/external/indexwebhook/INDEX_WEBHOOK_API.md)): an `audio` part (`audio/mp4`), a `transcription` part, or both, plus `recordedAt`/`client` fields and `X-Index-*` headers. Audio is uploaded with `com.atproto.repo.uploadBlob` and the record written with `com.atproto.space.createRecord`. Record keys are derived from the recording id (or timestamp), so the Pebble app's retry-on-next-recording behaviour is idempotent. Test events ("Send test event" in the app) are acknowledged and shown on the dashboard without writing a record.
- **The dashboard** lists your recordings via `com.atproto.space.listRecords` and streams audio through `/api/audio/<cid>` (`com.atproto.space.getBlob`), gated by your web session.

## Setup

You'll need Node.js 22+ and pnpm. The toolchain is [Vite+](https://github.com/voidzero-dev/vite-plus) (installed as a dev dependency, so the `pnpm` scripts below use it automatically; with `vp` on your PATH you can also call `vp dev` / `vp test` / `vp check` directly).

```sh
pnpm install
pnpm dev    # codegen + vp dev
pnpm test   # vp test (vitest)
pnpm check  # vp check (oxfmt + oxlint) + svelte-check
```

Open <http://127.0.0.1:5173> and sign in with an account on a spaces-compatible PDS. Then, in the Pebble app: **Index 01 Settings → Webhook**, paste your webhook URL from the dashboard, and pick **Both** as the payload mode.

Configuration is via environment variables — see [`.env.example`](./.env.example).

### Against the atproto dev network

To develop against the [multi-PDS dev network](https://github.com/bluesky-social/atproto/pull/5187) (a sibling checkout of `bluesky-social/atproto` on the `permissioned-data` branch):

```sh
# in the atproto checkout
pnpm --filter @atproto/dev-env start:multi-pds

# in this repo
DEV_INTROSPECT_URL=http://localhost:2581 pnpm publish-lexicons
PLC_URL=http://localhost:2582 DEV_INTROSPECT_URL=http://localhost:2581 pnpm dev
```

### Simulating the ring

```sh
ffmpeg -f lavfi -i sine=frequency=440:duration=2 -c:a aac -ar 16000 -ac 1 test.m4a
curl -X POST "$WEBHOOK_URL" \
  -H "X-Index-Trigger: single-click-hold" \
  -F "audio=@test.m4a;type=audio/mp4" \
  -F "transcription=hello from the fake ring" \
  -F "recordedAt=$(date +%s%3N)" \
  -F "client=ring"
```

## Deploying

A fully static deployment isn't possible: the webhook needs an always-on server holding your OAuth session. The app is one small Node process (SvelteKit `adapter-node`) plus one SQLite file.

### Railway

Two ways in — both build with the repo's [`Dockerfile`](./Dockerfile):

- **Dashboard**: create a service from this GitHub repo ([`railway.json`](./railway.json) supplies the build/deploy settings) and attach a **volume mounted at `/data`**. No env vars are required: `PUBLIC_URL` is derived from Railway's injected `RAILWAY_PUBLIC_DOMAIN`, and the Dockerfile defaults `DATABASE_PATH=/data/asteroid.db`.
- **Infrastructure as Code**: [`.railway/railway.ts`](./.railway/railway.ts) declares the whole thing — service, volume, and env vars. Run `railway config plan` then `railway config apply` with the [Railway CLI](https://docs.railway.com/infrastructure-as-code). (If you go this way, delete `railway.json`; Railway won't let IaC manage a service authored from it.)

Using a custom domain? Set `PUBLIC_URL=https://your.domain` explicitly. Note that changing the app's origin changes its OAuth `client_id`, so existing logins reset.

### Anywhere else (Docker)

```sh
docker build -t asteroid .
docker run -p 3000:3000 -v asteroid-data:/data -e PUBLIC_URL=https://your.domain asteroid
```

One-time production setup for the lexicons (so the `include:` OAuth scope resolves):

1. Create a DNS TXT record `_lexicon.pebble-index.byjp.me` → `did=<lexicon authority DID>`.
2. `LEXICON_AUTHORITY_HANDLE=… LEXICON_AUTHORITY_PASSWORD=… LEXICON_AUTHORITY_PDS=… pnpm publish-lexicons`

## License

[MIT](./LICENSE)
