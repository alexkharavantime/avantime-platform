FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install --no-install-recommends -y \
    poppler-utils \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-lav \
    tesseract-ocr-rus \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /workspace
COPY package.json package-lock.json ./
COPY apps/web/package.json apps/web/package.json
COPY packages/database/package.json packages/database/package.json
COPY packages/shared/package.json packages/shared/package.json
COPY packages/ui/package.json packages/ui/package.json
RUN npm ci

COPY . .
CMD ["npm", "run", "test:ocr-integration"]
