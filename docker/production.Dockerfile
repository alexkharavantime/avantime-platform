# syntax=docker/dockerfile:1.7
FROM node:22.23.1-alpine3.23 AS dependencies
WORKDIR /workspace
COPY package.json package-lock.json turbo.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --no-audit --no-fund

FROM dependencies AS migration
ENV NODE_ENV=production
COPY --chown=node:node packages/database/prisma ./packages/database/prisma
COPY --chmod=0555 docker/run-staging-migrations.sh /usr/local/bin/run-staging-migrations
USER node
CMD ["run-staging-migrations"]

FROM dependencies AS builder
ARG SESSION_SECRET=build-only-placeholder-with-at-least-32-characters
ENV NEXT_TELEMETRY_DISABLED=1
ENV SESSION_SECRET=$SESSION_SECRET
COPY . .
RUN mkdir -p apps/web/public \
    && npm run db:generate \
    && npm run build -w @avantime/web

FROM node:22.23.1-alpine3.23 AS web
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
WORKDIR /app
RUN addgroup -S -g 10001 avantime && adduser -S -u 10001 -G avantime avantime
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/.next/standalone ./
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/.next/static ./apps/web/.next/static
COPY --from=builder --chown=avantime:avantime /workspace/apps/web/public ./apps/web/public
USER 10001:10001
EXPOSE 3000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -q -O /dev/null http://127.0.0.1:3000/api/health/documents || exit 1
CMD ["node", "apps/web/server.js"]

FROM node:22.23.1-alpine3.23 AS worker-base
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
WORKDIR /workspace
RUN apk add --no-cache poppler-utils tesseract-ocr tesseract-ocr-data-eng \
      tesseract-ocr-data-rus tesseract-ocr-data-lav \
    && addgroup -S -g 10001 avantime \
    && adduser -S -u 10001 -G avantime avantime
COPY --from=builder --chown=avantime:avantime /workspace/package.json /workspace/package-lock.json ./
COPY --from=builder --chown=avantime:avantime /workspace/node_modules ./node_modules
COPY --from=builder --chown=avantime:avantime /workspace/apps ./apps
COPY --from=builder --chown=avantime:avantime /workspace/packages ./packages
RUN npm prune --omit=dev \
    && npm pkg delete overrides.esbuild \
    && npm install --no-save --omit=dev esbuild@0.28.1 \
    && rm -rf /root/.npm \
              /workspace/apps/web/.next \
              /workspace/node_modules/nanoid \
              /workspace/node_modules/postcss \
              /workspace/node_modules/next/node_modules/postcss \
              /workspace/node_modules/sharp \
              /usr/local/lib/node_modules/npm \
              /usr/local/lib/node_modules/corepack \
              /opt/yarn-v1.22.22 \
    && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg \
    && mkdir -p /tmp/avantime \
    && chown avantime:avantime /tmp/avantime
USER 10001:10001

FROM worker-base AS document-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-document-worker.ts"]

FROM worker-base AS embedding-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-document-embedding-worker.ts"]

FROM worker-base AS notification-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-notification-worker.ts"]

FROM worker-base AS jira-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-jira-worker.ts"]

FROM worker-base AS jira-inbound-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-jira-inbound-worker.ts"]

FROM worker-base AS knowledge-index-worker
CMD ["node", "--import", "tsx", "apps/web/scripts/run-knowledge-index-worker.ts"]

FROM worker-base AS operations
USER root
RUN apk add --no-cache postgresql-client
USER 10001:10001
CMD ["node", "--import", "tsx", "apps/web/scripts/check-production-readiness.ts"]
