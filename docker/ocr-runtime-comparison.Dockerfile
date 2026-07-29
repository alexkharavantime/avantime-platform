# syntax=docker/dockerfile:1.7
# Controlled TASK-006 evaluation only. These targets are ephemeral and are never published.
FROM node:22.22.2-alpine3.23 AS builder
WORKDIR /workspace
RUN apk upgrade --no-cache libcrypto3 libssl3
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN --mount=type=cache,target=/root/.npm npm ci --no-audit --no-fund
COPY . .
RUN npm run build:production-entrypoints -w @avantime/web -- --outdir=/workspace/production-entrypoints

FROM node:22.22.2-alpine3.23 AS alpine
RUN apk upgrade --no-cache libcrypto3 libssl3 \
  && apk add --no-cache \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-data-eng \
    tesseract-ocr-data-lav \
    tesseract-ocr-data-rus \
  && addgroup -S -g 10001 avantime \
  && adduser -S -u 10001 -G avantime avantime \
  && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /workspace
COPY --from=builder --chown=avantime:avantime /workspace/production-entrypoints/ocr-integration-test.mjs ./ocr-integration-test.mjs
ENV RUN_DOCUMENT_OCR_INTEGRATION_TESTS=1
USER 10001:10001
CMD ["node", "--test", "ocr-integration-test.mjs"]

FROM node:22.22.2-trixie-slim AS debian-slim
RUN apt-get update \
  && apt-get upgrade -y \
  && apt-get install -y --no-install-recommends \
    ca-certificates \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-lav \
    tesseract-ocr-rus \
  && groupadd --gid 10001 avantime \
  && useradd --uid 10001 --gid 10001 --no-create-home --shell /usr/sbin/nologin avantime \
  && rm -rf /var/lib/apt/lists/* \
    /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx
WORKDIR /workspace
COPY --from=builder --chown=avantime:avantime /workspace/production-entrypoints/ocr-integration-test.mjs ./ocr-integration-test.mjs
ENV RUN_DOCUMENT_OCR_INTEGRATION_TESTS=1
USER 10001:10001
CMD ["node", "--test", "ocr-integration-test.mjs"]
