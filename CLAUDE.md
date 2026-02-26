# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

OneStepAWS is a Tauri v2 desktop app that enables one-click download of genomics data from AWS S3 via a custom `onestep://` URL scheme. The app handles parallel downloads with MD5 verification and resume support. Target users are Japanese research clients receiving sequencing data.

## Build & Development Commands

```bash
npm install              # Install frontend dependencies
npm run dev              # Vite dev server (port 1420) + Tauri dev window
npm run build            # TypeScript check + Vite production build
npx tauri build          # Full release build (frontend + Rust → .app/.dmg/.exe)
cd src-tauri && cargo test  # Run Rust unit tests (url_parser, md5_engine)
```

**Releasing:** Push a `v*` tag to trigger GitHub Actions CI that builds macOS (aarch64 + x64) and Windows (x64) installers, then uploads them as GitHub Release assets.

```bash
git tag v0.x.x && git push origin v0.x.x
```

## Architecture

**Two-process Tauri v2 app:**

- **Frontend** (`src/`): React 19 + TypeScript + Tailwind CSS + i18next (ja/en/zh)
- **Backend** (`src-tauri/src/`): Rust with aws-sdk-s3, tokio async runtime

**Data flow:**
1. User clicks `onestep://download?ak=...&sk=...&bucket=...&project=...` link in browser/email
2. macOS/Windows launches the app via registered URL scheme
3. `url_parser.rs` extracts AWS credentials and project info from the URL
4. `s3_client.rs` lists project files and downloads `.md5` checksum files
5. `download_engine.rs` downloads data files in parallel (3 concurrent), streaming MD5 computation
6. `state.rs` persists progress to `~/.onestep-aws/tasks/{project}.json` for resume
7. Progress events (`overall-progress`, `file-progress`) are emitted to the frontend via Tauri events

**Frontend page flow** (state machine in `App.tsx`):
`loading` → `project-info` → `downloading` → `results` | `error`

**Deep link race condition handling:** On macOS cold start, `get_current()` returns None. The URL arrives via `on_open_url` callback which stores it in `InitialUrl` managed state. Frontend polls `get_initial_url()` with retry logic.

## Key Rust Modules

| Module | Responsibility |
|--------|---------------|
| `lib.rs` | App setup, deep-link plugin, debug logging to `/tmp/onestep-debug.log` |
| `commands.rs` | 4 Tauri IPC commands: `parse_download_url`, `fetch_project_info`, `start_download`, `get_initial_url` |
| `url_parser.rs` | Parses `onestep://` URLs, handles URL-encoded secrets. Has unit tests. |
| `s3_client.rs` | AWS S3 client creation with `BehaviorVersion::latest()`, file listing with pagination |
| `download_engine.rs` | Parallel download orchestration, streaming MD5, per-file progress events |
| `md5_engine.rs` | Parses standard and BSD-format `.md5`/`MD5.txt` files. Has unit tests. |
| `state.rs` | JSON state persistence for download resume (`~/.onestep-aws/tasks/`) |

## Frontend Structure

| File | Purpose |
|------|---------|
| `src/lib/tauri-api.ts` | TypeScript wrappers for all Tauri `invoke()` calls |
| `src/lib/format.ts` | `formatBytes()`, `daysUntil()` utilities |
| `src/pages/ProjectInfo.tsx` | File listing, save path selector, download button |
| `src/pages/DownloadProgress.tsx` | Real-time progress bars from Tauri events |
| `src/pages/VerifyResult.tsx` | MD5 verification results, retry failed files |
| `src/i18n/` | i18next config with ja/en/zh translations |

## URL Scheme

```
onestep://download?ak={access_key}&sk={secret_key}&bucket={bucket}&region={region}&project={prefix}&expires={YYYY-MM-DD}
```

All parameters except `expires` are required. The `project` parameter is the S3 key prefix. Directory structure under the prefix is preserved locally.

## Important Patterns

- **Tilde expansion:** Rust `std::fs` does not expand `~`. The `expand_tilde()` function in `commands.rs` handles this.
- **S3 error mapping:** `s3_client.rs` maps AWS SDK errors to user-friendly messages (InvalidAccessKeyId, SignatureDoesNotMatch, AccessDenied, NoSuchBucket).
- **MD5 on-the-fly:** Download engine computes MD5 while streaming data, avoiding a second pass over large files.
- **State resume:** Downloads can resume after app closure. State file tracks per-file status (Pending/Downloading/Downloaded/Verified/Failed).

## CI/CD

GitHub Actions workflow (`.github/workflows/build.yml`) builds on tag push:
- macOS: aarch64-apple-darwin, x86_64-apple-darwin
- Windows: x86_64-pc-windows-msvc
- Uses `tauri-apps/tauri-action@v0` for bundling
- Requires repo workflow permissions set to "write" for release creation
