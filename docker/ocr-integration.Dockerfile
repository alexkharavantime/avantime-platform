FROM golang:1.26.6-alpine AS ocr-esbuild-builder
ARG ESBUILD_VERSION=0.26.0
RUN GOBIN=/tmp/esbuild-bin go install "github.com/evanw/esbuild/cmd/esbuild@v${ESBUILD_VERSION}"

FROM node:22.23.2-bookworm-slim AS dependencies
ARG ESBUILD_VERSION=0.26.0
WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci --no-audit --no-fund
COPY --from=ocr-esbuild-builder /tmp/esbuild-bin/esbuild /tmp/esbuild
RUN set -eux; \
    package_dir=/workspace/node_modules/esbuild; \
    modules_dir=/workspace/node_modules; \
    version="$(node -p "require('$package_dir/package.json').version")"; \
    platform_binary="$modules_dir/@esbuild/linux-x64/bin/esbuild"; \
    package_binary="$package_dir/bin/esbuild"; \
    test "$version" = "$ESBUILD_VERSION"; \
    install -m 0755 /tmp/esbuild "$platform_binary"; \
    install -m 0755 /tmp/esbuild "$package_binary"; \
    rm -f /tmp/esbuild

FROM node:22.23.2-bookworm-slim
RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-lav \
    tesseract-ocr-rus \
  && rm -rf /var/lib/apt/lists/*
WORKDIR /workspace
COPY --from=dependencies /workspace/node_modules ./node_modules
COPY . .
RUN rm -rf /usr/local/lib/node_modules/npm \
    /usr/local/lib/node_modules/corepack \
    /opt/yarn-v1.22.22 \
    /workspace/node_modules/sharp \
    /workspace/node_modules/@img \
  && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg
ENV RUN_DOCUMENT_OCR_INTEGRATION_TESTS=1
CMD ["node", "--import", "tsx", "--test", "apps/web/tests/integration/document-ocr.integration.test.ts"]
