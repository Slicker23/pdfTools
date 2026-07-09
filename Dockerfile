# syntax=docker/dockerfile:1

###############################################################################
# Base — Debian trixie (13): glibc + a recent libstdc++ (GLIBCXX_3.4.33) that
# pdfium-native's prebuilt binary requires (needs >= 3.4.31; bookworm only has
# 3.4.30). Node 24 matches the known-good local build. LibreOffice/OCR toolchain
# is available on trixie too.
###############################################################################
FROM node:24-trixie-slim AS base
ENV NODE_ENV=production
WORKDIR /app

###############################################################################
# deps — full install (incl. dev deps) used for building and for the worker,
# which runs TypeScript directly via tsx (a devDependency).
###############################################################################
FROM base AS deps
COPY package.json package-lock.json ./
# postinstall copies the pdfjs worker into public/pdfjs; allow dev deps here.
RUN npm ci --include=dev

###############################################################################
# builder — compile the Next.js app. NEXT_PUBLIC_* values are inlined at build
# time, so they must be provided as build args.
###############################################################################
FROM base AS builder
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ARG NEXT_PUBLIC_YJS_WS_URL=ws://localhost:1234
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL
ENV NEXT_PUBLIC_YJS_WS_URL=$NEXT_PUBLIC_YJS_WS_URL
COPY --from=deps /app/node_modules ./node_modules
COPY . .
# Ensure pdfjs worker + standard fonts are present even if not in the build context.
RUN mkdir -p public/pdfjs/standard_fonts \
  && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/pdf.worker.min.mjs \
  && cp -r node_modules/pdfjs-dist/standard_fonts/. public/pdfjs/standard_fonts/ \
  && npm run build

###############################################################################
# prod-deps — pruned runtime modules for the web server (keeps next,
# drizzle-kit, pdfium-native, @napi-rs/canvas).
###############################################################################
FROM base AS prod-deps
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

###############################################################################
# web — runs `next start`. Uses pruned prod node_modules + build output.
###############################################################################
FROM base AS web
RUN apt-get update \
  && apt-get install -y --no-install-recommends libfontconfig1 fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*
ENV PORT=3000
COPY --from=prod-deps /app/node_modules ./node_modules
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/next.config.ts ./next.config.ts
COPY --from=builder /app/drizzle.config.ts ./drizzle.config.ts
COPY --from=builder /app/drizzle ./drizzle
# Full src is needed at runtime: next.config.ts references ./src/i18n/request.ts,
# and the one-shot migrate step (same image) reads ./src/db/schema.ts.
COPY --from=builder /app/src ./src
COPY --from=builder /app/tsconfig.json ./tsconfig.json
COPY package.json ./package.json
EXPOSE 3000
CMD ["npm", "run", "start"]

###############################################################################
# worker — BullMQ consumer. Runs TS via tsx and shells out to the document
# toolchain (LibreOffice, OCRmyPDF, Ghostscript, Tesseract).
###############################################################################
FROM base AS worker
RUN apt-get update \
  && apt-get install -y --no-install-recommends \
    libreoffice-writer \
    libreoffice-calc \
    libreoffice-impress \
    libreoffice-core \
    tesseract-ocr \
    tesseract-ocr-eng \
    tesseract-ocr-ita \
    ocrmypdf \
    ghostscript \
    libfontconfig1 \
    fonts-dejavu \
  && rm -rf /var/lib/apt/lists/*
ENV LIBREOFFICE_PATH=soffice
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN mkdir -p public/pdfjs/standard_fonts \
  && cp node_modules/pdfjs-dist/build/pdf.worker.min.mjs public/pdfjs/pdf.worker.min.mjs \
  && cp -r node_modules/pdfjs-dist/standard_fonts/. public/pdfjs/standard_fonts/
CMD ["npx", "tsx", "src/worker/index.ts"]
