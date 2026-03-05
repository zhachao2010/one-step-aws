# CLAUDE.md

This file provides guidance to Claude Code when working with code in this repository.

## Project Overview

OneStepAWS is a web-based AWS S3 data download tool. It generates download links that provide a one-click download experience with MD5 verification, resume support, and file selection. No software installation required.

The system has two parts:
1. **Admin page** (`admin.html`): Browser-based form for generating download links (no server needed)
2. **Downloader app** (`src/downloader/`): React SPA that handles the actual file downloads

## Build & Development Commands

```bash
npm install          # Install dependencies
npm run dev          # Vite dev server (port 5173)
npm run build        # Production build → dist-downloader/
npm run build:single # Single-file HTML build → dist-single/ (for S3-hosted delivery)
```

## Architecture

**Web-based downloader (React SPA):**

- **Frontend** (`src/downloader/`): React 19 + TypeScript + Tailwind CSS + i18next (ja/en/zh)
- **No backend**: All S3 operations happen client-side using AWS SDK for JS

**Two download modes:**
1. **Streaming mode** (preferred): Uses File System Access API (Chrome/Edge) to stream files directly to disk with resume support and MD5 verification
2. **Presigned URL mode** (fallback): Generates per-file presigned URLs for browsers without File System Access API

**Data flow:**
1. Admin generates a download URL via `admin.html` or `scripts/generate-link.mjs`
2. URL contains AWS credentials + file manifest (compressed, base64-encoded in URL hash)
3. Client opens URL → downloader app loads, parses params, lists/verifies files
4. User selects files, picks save directory, downloads begin with progress tracking
5. MD5 checksums are verified on-the-fly during download

**Frontend page flow** (state machine in `App.tsx`):
`loading` → `project-info` → `downloading` → `results` | `error`

**Key source files:**

| Path | Purpose |
|------|---------|
| `src/downloader/App.tsx` | Main app component, state machine |
| `src/downloader/lib/download-engine.ts` | Parallel download with streaming MD5, resume support |
| `src/downloader/lib/s3-browser.ts` | S3 client, file listing, streaming with Range requests |
| `src/downloader/lib/url-parser.ts` | URL parameter + compressed manifest parsing |
| `src/downloader/lib/md5-utils.ts` | MD5 checksum file parsing (standard + BSD format) |
| `src/downloader/lib/types.ts` | TypeScript type definitions |
| `src/downloader/pages/StreamingDownload.tsx` | File selection UI + streaming download initiation |
| `src/downloader/pages/PresignedDownload.tsx` | Fallback per-file presigned URL download |
| `src/downloader/pages/DownloadProgress.tsx` | Real-time progress bars |
| `src/downloader/pages/VerifyResult.tsx` | MD5 verification results, retry failed files |
| `src/i18n/` | i18next config with ja/en/zh translations |
| `src/lib/format.ts` | `formatBytes()`, `daysUntil()` utilities |
| `scripts/generate-link.mjs` | CLI tool for generating download links |
| `scripts/setup-cors.sh` | S3 CORS configuration script |
| `admin.html` | Standalone admin page for generating download links |

## Deployment

GitHub Pages via GitHub Actions (`.github/workflows/deploy-downloader.yml`):
- Triggers on push to `main` when relevant files change
- Builds both multi-file and single-file versions
- Copies `admin.html` and `template.html` into deploy directory
- Deploys to GitHub Pages

## Link Generation

Two methods:
1. **Admin page** (`admin.html`): Browser-based form with SigV4 signing, generates presigned S3 links client-side
2. **CLI script** (`scripts/generate-link.mjs`): Uploads self-contained HTML to S3, returns presigned URL

## Important Patterns

- **File System Access API:** Required for streaming downloads. Chrome/Edge only. Falls back to presigned URL mode.
- **Compressed manifest:** File list is deflate-compressed and base64url-encoded in URL hash.
- **MD5 on-the-fly:** Download engine computes MD5 while streaming, no second pass needed.
- **Resume support:** Detects existing partial files via File System Access API, resumes with HTTP Range requests.
- **CORS requirement:** Streaming mode needs S3 CORS config. Use `scripts/setup-cors.sh`.
