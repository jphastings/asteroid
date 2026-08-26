FROM node:22-bookworm-slim AS build

RUN apt-get update \
  && apt-get install -y --no-install-recommends ca-certificates python3 make g++ \
  && rm -rf /var/lib/apt/lists/* \
  && corepack enable

WORKDIR /app
COPY . .

RUN corepack prepare pnpm@10.33.0 --activate \
  && pnpm install --frozen-lockfile \
  && pnpm build \
  && pnpm prune --prod

FROM node:22-bookworm-slim

WORKDIR /app
COPY --from=build /app/build ./build
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json

ENV NODE_ENV=production
ENV PORT=3000
ENV DATABASE_PATH=/data/asteroid.db
VOLUME /data

EXPOSE 3000
CMD ["node", "build/index.js"]
