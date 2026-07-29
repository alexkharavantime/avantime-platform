# syntax=docker/dockerfile:1.7
FROM node:22.22.2-alpine3.23 AS dependencies
WORKDIR /workspace
RUN apk upgrade --no-cache libcrypto3 libssl3
COPY docker/staging-secrets-entrypoint.mjs /usr/local/bin/avantime-secrets-entrypoint.mjs
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund

FROM dependencies AS builder
ARG SESSION_SECRET=build-only-placeholder-with-at-least-32-characters
ENV NEXT_TELEMETRY_DISABLED=1
ENV SESSION_SECRET=$SESSION_SECRET
COPY . .
RUN mkdir -p apps/web/public \
    && npm run db:generate \
    && npm run build:production-entrypoints -w @avantime/web -- --outdir=/workspace/production-entrypoints \
    && npm run build -w @avantime/web

FROM node:22.22.2-alpine3.23 AS runtime-dependencies
ENV NODE_ENV=production
WORKDIR /workspace
RUN apk upgrade --no-cache libcrypto3 libssl3
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --omit=dev --omit=optional --no-audit --no-fund
RUN rm -rf node_modules/tsx node_modules/esbuild node_modules/@esbuild node_modules/typescript \
      /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx \
    && for forbidden in node_modules/tsx node_modules/esbuild node_modules/@esbuild node_modules/typescript; do \
      if [ -e "$forbidden" ]; then echo "Forbidden runtime dependency remains: $forbidden" >&2; exit 1; fi; \
    done
COPY --from=dependencies /usr/local/bin/avantime-secrets-entrypoint.mjs /usr/local/bin/avantime-secrets-entrypoint.mjs

FROM runtime-dependencies AS migration
COPY --chown=node:node packages/database/prisma ./packages/database/prisma
RUN rm -rf node_modules/next node_modules/react node_modules/react-dom node_modules/sharp \
    node_modules/@aws-sdk node_modules/@google node_modules/openai node_modules/pdf-parse \
    node_modules/postcss node_modules/redis
USER node
ENTRYPOINT ["node", "/usr/local/bin/avantime-secrets-entrypoint.mjs"]
CMD ["node", "node_modules/prisma/build/index.js", "migrate", "deploy", "--schema", "packages/database/prisma/schema.prisma"]

FROM node:22.22.2-alpine3.23 AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app
RUN apk upgrade --no-cache libcrypto3 libssl3 \
    && addgroup -S -g 10001 avantime \
    && adduser -S -u 10001 -G avantime avantime \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/public ./apps/web/public
COPY --from=dependencies /usr/local/bin/avantime-secrets-entrypoint.mjs /usr/local/bin/avantime-secrets-entrypoint.mjs
RUN rm -rf node_modules/tsx node_modules/esbuild node_modules/@esbuild node_modules/typescript
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health/documents || exit 1
ENTRYPOINT ["node", "/usr/local/bin/avantime-secrets-entrypoint.mjs"]
CMD ["node", "apps/web/server.js"]

FROM runtime-dependencies AS worker-base
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
RUN addgroup -S -g 10001 avantime \
    && adduser -S -u 10001 -G avantime avantime
COPY --from=builder --chown=avantime:avantime /workspace/node_modules/.prisma ./node_modules/.prisma
RUN rm -rf node_modules/next node_modules/react node_modules/react-dom node_modules/sharp \
      node_modules/postcss \
      node_modules/prisma node_modules/@prisma/engines node_modules/@prisma/engines-version \
      node_modules/@prisma/fetch-engine node_modules/@prisma/get-platform \
      node_modules/@avantime apps packages \
    && mkdir -p /tmp/avantime \
    && chown avantime:avantime /tmp/avantime \
    && test ! -e node_modules/tsx \
    && test ! -e node_modules/esbuild \
    && test ! -e node_modules/@esbuild \
    && test ! -e node_modules/typescript
USER 10001:10001
ENTRYPOINT ["node", "/usr/local/bin/avantime-secrets-entrypoint.mjs"]

FROM worker-base AS document-worker
USER root
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng \
      tesseract-ocr-data-rus tesseract-ocr-data-lav
COPY --from=builder --chown=avantime:avantime /workspace/production-entrypoints/document-worker.mjs ./production-entrypoints/document-worker.mjs
USER 10001:10001
CMD ["node", "production-entrypoints/document-worker.mjs"]

FROM worker-base AS embedding-worker
COPY --from=builder --chown=avantime:avantime /workspace/production-entrypoints/embedding-worker.mjs ./production-entrypoints/embedding-worker.mjs
CMD ["node", "production-entrypoints/embedding-worker.mjs"]

FROM worker-base AS operations
USER root
RUN apk add --no-cache postgresql-client
COPY --from=builder --chown=avantime:avantime /workspace/production-entrypoints ./production-entrypoints
USER 10001:10001
CMD ["node", "production-entrypoints/production-readiness.mjs"]
