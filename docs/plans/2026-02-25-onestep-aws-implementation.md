# OneStepAWS Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a Tauri v2 cross-platform desktop app that lets clients download S3 data and verify MD5 checksums with a single link click.

**Architecture:** Tauri v2 with Rust backend (S3 download engine, streaming MD5, state persistence) and React + TypeScript frontend (3-page flow: project info → download progress → verification results). Custom `onestep://` URL scheme triggers the app with embedded credentials.

**Tech Stack:** Tauri v2, Rust (aws-sdk-s3, md5, tokio, serde), React 18, TypeScript, Tailwind CSS, i18next

**Design doc:** `docs/plans/2026-02-25-onestep-aws-design.md`

---

## Task 1: Project Scaffolding

**Files:**
- Create: entire project structure via `create-tauri-app`
- Modify: `package.json`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`

**Step 1: Create Tauri v2 project**

Run:
```bash
cd /Users/zhachao/Workspace/project/LCY-Company/one-step-aws
npm create tauri-app@latest . -- --template react-ts
```

Select: TypeScript, React, npm. Identifier: `com.lcy.onestep-aws`

**Step 2: Install frontend dependencies**

Run:
```bash
npm install
npm install -D tailwindcss @tailwindcss/vite
npm install i18next react-i18next
npm install @tauri-apps/plugin-deep-link @tauri-apps/plugin-dialog @tauri-apps/plugin-shell
```

**Step 3: Add Rust dependencies to `src-tauri/Cargo.toml`**

Add under `[dependencies]`:
```toml
aws-sdk-s3 = "1"
aws-config = "1"
aws-credential-types = "1"
md-5 = "0.10"
tokio = { version = "1", features = ["full"] }
serde = { version = "1", features = ["derive"] }
serde_json = "1"
url = "2"
dirs = "5"
chrono = { version = "0.4", features = ["serde"] }
tauri-plugin-deep-link = "2"
tauri-plugin-dialog = "2"
tauri-plugin-shell = "2"
```

**Step 4: Configure Tailwind CSS**

Create `src/index.css`:
```css
@import "tailwindcss";
```

Add Tailwind plugin to `vite.config.ts`:
```typescript
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // ...existing config
});
```

**Step 5: Configure `tauri.conf.json`**

Set window size, app name, and deep-link plugin:
```json
{
  "productName": "OneStepAWS",
  "version": "0.1.0",
  "identifier": "com.lcy.onestep-aws",
  "app": {
    "windows": [
      {
        "title": "OneStepAWS",
        "width": 640,
        "height": 520,
        "minWidth": 640,
        "minHeight": 520,
        "resizable": true
      }
    ]
  },
  "plugins": {
    "deep-link": {
      "desktop": {
        "schemes": ["onestep"]
      }
    }
  }
}
```

**Step 6: Verify project builds**

Run:
```bash
npm run tauri dev
```

Expected: Tauri window opens with default React page.

**Step 7: Commit**

```bash
git add -A
git commit -m "feat: scaffold Tauri v2 project with React + TypeScript"
```

---

## Task 2: Rust — URL Parser Module

**Files:**
- Create: `src-tauri/src/url_parser.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod url_parser;`)

**Step 1: Write failing tests**

In `src-tauri/src/url_parser.rs`:
```rust
use serde::{Deserialize, Serialize};
use url::Url;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct DownloadParams {
    pub access_key: String,
    pub secret_key: String,
    pub bucket: String,
    pub region: String,
    pub project: String,
    pub expires: Option<String>,
}

pub fn parse_deep_link(_url: &str) -> Result<DownloadParams, String> {
    todo!()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_valid_url_all_params() {
        let url = "onestep://download?ak=AKIATEST&sk=secretkey123&bucket=my-bucket&region=ap-northeast-1&project=PROJ001&expires=2026-03-14";
        let params = parse_deep_link(url).unwrap();
        assert_eq!(params.access_key, "AKIATEST");
        assert_eq!(params.secret_key, "secretkey123");
        assert_eq!(params.bucket, "my-bucket");
        assert_eq!(params.region, "ap-northeast-1");
        assert_eq!(params.project, "PROJ001");
        assert_eq!(params.expires, Some("2026-03-14".to_string()));
    }

    #[test]
    fn test_parse_valid_url_without_expires() {
        let url = "onestep://download?ak=AKIATEST&sk=secret&bucket=b&region=us-east-1&project=P1";
        let params = parse_deep_link(url).unwrap();
        assert_eq!(params.expires, None);
    }

    #[test]
    fn test_parse_missing_required_param() {
        let url = "onestep://download?ak=AKIATEST&sk=secret&bucket=b&region=us-east-1";
        assert!(parse_deep_link(url).is_err());
    }

    #[test]
    fn test_parse_invalid_url() {
        assert!(parse_deep_link("not a url").is_err());
    }

    #[test]
    fn test_parse_url_encoded_secret_key() {
        let url = "onestep://download?ak=AKIA&sk=5hC7bo9Yb2Kdpsp%2BNUA6mnx&bucket=b&region=r&project=p";
        let params = parse_deep_link(url).unwrap();
        assert_eq!(params.secret_key, "5hC7bo9Yb2Kdpsp+NUA6mnx");
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test url_parser -- --nocapture`
Expected: FAIL with `not yet implemented`

**Step 3: Implement parser**

Replace `todo!()` with:
```rust
pub fn parse_deep_link(raw_url: &str) -> Result<DownloadParams, String> {
    let url = Url::parse(raw_url).map_err(|e| format!("Invalid URL: {}", e))?;

    let get_param = |name: &str| -> Result<String, String> {
        url.query_pairs()
            .find(|(k, _)| k == name)
            .map(|(_, v)| v.to_string())
            .ok_or_else(|| format!("Missing required parameter: {}", name))
    };

    Ok(DownloadParams {
        access_key: get_param("ak")?,
        secret_key: get_param("sk")?,
        bucket: get_param("bucket")?,
        region: get_param("region")?,
        project: get_param("project")?,
        expires: url.query_pairs()
            .find(|(k, _)| k == "expires")
            .map(|(_, v)| v.to_string()),
    })
}
```

**Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test url_parser -- --nocapture`
Expected: all 5 tests PASS

**Step 5: Commit**

```bash
git add src-tauri/src/url_parser.rs src-tauri/src/lib.rs
git commit -m "feat: add URL parser for onestep:// deep links"
```

---

## Task 3: Rust — S3 Client Module

**Files:**
- Create: `src-tauri/src/s3_client.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod s3_client;`)

**Step 1: Define types and create S3 client factory**

In `src-tauri/src/s3_client.rs`:
```rust
use aws_config::Region;
use aws_credential_types::Credentials;
use aws_sdk_s3::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct S3FileInfo {
    pub key: String,
    pub size: u64,
    pub is_md5_file: bool,
}

pub fn create_client(access_key: &str, secret_key: &str, region: &str) -> Client {
    let credentials = Credentials::new(
        access_key,
        secret_key,
        None,
        None,
        "onestep-aws",
    );
    let config = aws_sdk_s3::config::Builder::new()
        .region(Region::new(region.to_string()))
        .credentials_provider(credentials)
        .build();
    Client::from_conf(config)
}
```

**Step 2: Implement list_project_files**

```rust
pub async fn list_project_files(
    client: &Client,
    bucket: &str,
    project: &str,
) -> Result<Vec<S3FileInfo>, String> {
    let prefix = if project.ends_with('/') {
        project.to_string()
    } else {
        format!("{}/", project)
    };

    let mut files = Vec::new();
    let mut continuation_token: Option<String> = None;

    loop {
        let mut req = client
            .list_objects_v2()
            .bucket(bucket)
            .prefix(&prefix)
            .max_keys(1000);

        if let Some(token) = continuation_token.take() {
            req = req.continuation_token(token);
        }

        let resp = req.send().await.map_err(|e| format!("S3 list error: {}", e))?;

        if let Some(contents) = resp.contents() {
            for obj in contents {
                let key = obj.key().unwrap_or_default().to_string();
                // Skip directory markers
                if key.ends_with('/') {
                    continue;
                }
                let size = obj.size().unwrap_or(0) as u64;
                let lower = key.to_lowercase();
                let is_md5_file = lower.ends_with(".md5")
                    || lower.ends_with("md5.txt")
                    || lower.ends_with("md5sum.txt");

                files.push(S3FileInfo { key, size, is_md5_file });
            }
        }

        if resp.is_truncated() == Some(true) {
            continuation_token = resp.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(files)
}
```

**Step 3: Write unit tests for MD5 file detection**

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_md5_file_detection() {
        let cases = vec![
            ("project/data/sample.md5", true),
            ("project/MD5.txt", true),
            ("project/md5sum.txt", true),
            ("project/data/sample.fastq.gz", false),
            ("project/report.pdf", false),
        ];
        for (key, expected) in cases {
            let lower = key.to_lowercase();
            let result = lower.ends_with(".md5")
                || lower.ends_with("md5.txt")
                || lower.ends_with("md5sum.txt");
            assert_eq!(result, expected, "Failed for key: {}", key);
        }
    }
}
```

**Step 4: Run tests**

Run: `cd src-tauri && cargo test s3_client -- --nocapture`
Expected: PASS

**Step 5: Commit**

```bash
git add src-tauri/src/s3_client.rs src-tauri/src/lib.rs
git commit -m "feat: add S3 client with file listing and MD5 detection"
```

---

## Task 4: Rust — MD5 Engine Module

**Files:**
- Create: `src-tauri/src/md5_engine.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod md5_engine;`)

**Step 1: Write failing tests for MD5 file parsing**

In `src-tauri/src/md5_engine.rs`:
```rust
use md5::{Md5, Digest};
use std::collections::HashMap;

/// Parse MD5 checksums from file content.
/// Supports formats:
///   md5hash  filename
///   md5hash *filename
///   MD5 (filename) = md5hash
pub fn parse_md5_content(_content: &str) -> HashMap<String, String> {
    todo!()
}

/// Compute MD5 of a byte slice (used for testing; real downloads use streaming).
pub fn compute_md5(data: &[u8]) -> String {
    let mut hasher = Md5::new();
    hasher.update(data);
    format!("{:x}", hasher.finalize())
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_parse_standard_format() {
        let content = "d41d8cd98f00b204e9800998ecf8427e  sample_01.fastq.gz\na1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4  sample_02.fastq.gz\n";
        let map = parse_md5_content(content);
        assert_eq!(map.get("sample_01.fastq.gz").unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
        assert_eq!(map.get("sample_02.fastq.gz").unwrap(), "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4");
    }

    #[test]
    fn test_parse_binary_flag_format() {
        let content = "d41d8cd98f00b204e9800998ecf8427e *sample.fastq.gz\n";
        let map = parse_md5_content(content);
        assert_eq!(map.get("sample.fastq.gz").unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn test_parse_bsd_format() {
        let content = "MD5 (sample.fastq.gz) = d41d8cd98f00b204e9800998ecf8427e\n";
        let map = parse_md5_content(content);
        assert_eq!(map.get("sample.fastq.gz").unwrap(), "d41d8cd98f00b204e9800998ecf8427e");
    }

    #[test]
    fn test_parse_with_path_prefix() {
        let content = "abc123  project/data/sample.fastq.gz\n";
        let map = parse_md5_content(content);
        // Should store with basename only
        assert_eq!(map.get("sample.fastq.gz").unwrap(), "abc123");
    }

    #[test]
    fn test_parse_empty_and_comment_lines() {
        let content = "# comment\n\nd41d8cd98f00b204e9800998ecf8427e  file.gz\n";
        let map = parse_md5_content(content);
        assert_eq!(map.len(), 1);
    }

    #[test]
    fn test_compute_md5() {
        let hash = compute_md5(b"hello world");
        assert_eq!(hash, "5eb63bbbe01eeed093cb22bb8f5acdc3");
    }
}
```

**Step 2: Run tests to verify they fail**

Run: `cd src-tauri && cargo test md5_engine -- --nocapture`
Expected: FAIL with `not yet implemented`

**Step 3: Implement parser**

Replace `todo!()`:
```rust
pub fn parse_md5_content(content: &str) -> HashMap<String, String> {
    let mut map = HashMap::new();

    for line in content.lines() {
        let line = line.trim();
        if line.is_empty() || line.starts_with('#') {
            continue;
        }

        // BSD format: MD5 (filename) = hash
        if line.starts_with("MD5 (") || line.starts_with("md5 (") {
            if let Some((name_part, hash)) = line.split_once(") = ") {
                let filename = name_part
                    .trim_start_matches("MD5 (")
                    .trim_start_matches("md5 (");
                let basename = filename.rsplit('/').next().unwrap_or(filename);
                map.insert(basename.to_string(), hash.trim().to_lowercase());
            }
            continue;
        }

        // Standard format: hash  filename  OR  hash *filename
        if let Some((hash, rest)) = line.split_once(|c: char| c.is_whitespace() || c == '*') {
            if hash.len() == 32 && hash.chars().all(|c| c.is_ascii_hexdigit()) {
                let filename = rest.trim().trim_start_matches('*');
                let basename = filename.rsplit('/').next().unwrap_or(filename);
                if !basename.is_empty() {
                    map.insert(basename.to_string(), hash.to_lowercase());
                }
            }
        }
    }

    map
}
```

**Step 4: Run tests to verify they pass**

Run: `cd src-tauri && cargo test md5_engine -- --nocapture`
Expected: all 6 tests PASS

**Step 5: Commit**

```bash
git add src-tauri/src/md5_engine.rs src-tauri/src/lib.rs
git commit -m "feat: add MD5 engine with multi-format parser and streaming compute"
```

---

## Task 5: Rust — State Manager Module

**Files:**
- Create: `src-tauri/src/state.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod state;`)

**Step 1: Write types and failing tests**

In `src-tauri/src/state.rs`:
```rust
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::{Path, PathBuf};

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum FileStatus {
    Pending,
    Downloading,
    Downloaded,
    Verified,
    Failed,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileState {
    pub size: u64,
    pub downloaded: u64,
    pub md5_expected: Option<String>,
    pub md5_calculated: Option<String>,
    pub status: FileStatus,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DownloadState {
    pub project: String,
    pub bucket: String,
    pub region: String,
    pub save_path: String,
    pub files: HashMap<String, FileState>,
}

impl DownloadState {
    pub fn new(project: &str, bucket: &str, region: &str, save_path: &str) -> Self {
        Self {
            project: project.to_string(),
            bucket: bucket.to_string(),
            region: region.to_string(),
            save_path: save_path.to_string(),
            files: HashMap::new(),
        }
    }

    pub fn state_dir() -> PathBuf {
        dirs::home_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join(".onestep-aws")
            .join("tasks")
    }

    pub fn state_path(project: &str) -> PathBuf {
        Self::state_dir().join(format!("{}.json", project))
    }

    pub fn save(&self) -> Result<(), String> {
        let dir = Self::state_dir();
        std::fs::create_dir_all(&dir).map_err(|e| format!("Cannot create state dir: {}", e))?;
        let path = Self::state_path(&self.project);
        let json = serde_json::to_string_pretty(self)
            .map_err(|e| format!("Serialize error: {}", e))?;
        std::fs::write(&path, json).map_err(|e| format!("Write error: {}", e))?;
        Ok(())
    }

    pub fn load(project: &str) -> Result<Option<Self>, String> {
        let path = Self::state_path(project);
        if !path.exists() {
            return Ok(None);
        }
        let content = std::fs::read_to_string(&path)
            .map_err(|e| format!("Read error: {}", e))?;
        let state: Self = serde_json::from_str(&content)
            .map_err(|e| format!("Deserialize error: {}", e))?;
        Ok(Some(state))
    }

    pub fn total_size(&self) -> u64 {
        self.files.values().map(|f| f.size).sum()
    }

    pub fn total_downloaded(&self) -> u64 {
        self.files.values().map(|f| f.downloaded).sum()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_state_serialize_deserialize() {
        let mut state = DownloadState::new("PROJ1", "bucket", "ap-northeast-1", "/tmp/dl");
        state.files.insert("file1.gz".to_string(), FileState {
            size: 1000,
            downloaded: 500,
            md5_expected: Some("abc123".to_string()),
            md5_calculated: None,
            status: FileStatus::Downloading,
        });

        let json = serde_json::to_string(&state).unwrap();
        let loaded: DownloadState = serde_json::from_str(&json).unwrap();

        assert_eq!(loaded.project, "PROJ1");
        assert_eq!(loaded.files["file1.gz"].downloaded, 500);
        assert_eq!(loaded.files["file1.gz"].status, FileStatus::Downloading);
    }

    #[test]
    fn test_total_size_and_downloaded() {
        let mut state = DownloadState::new("P", "b", "r", "/tmp");
        state.files.insert("a".to_string(), FileState {
            size: 1000, downloaded: 1000,
            md5_expected: None, md5_calculated: None,
            status: FileStatus::Downloaded,
        });
        state.files.insert("b".to_string(), FileState {
            size: 2000, downloaded: 500,
            md5_expected: None, md5_calculated: None,
            status: FileStatus::Downloading,
        });
        assert_eq!(state.total_size(), 3000);
        assert_eq!(state.total_downloaded(), 1500);
    }
}
```

**Step 2: Run tests**

Run: `cd src-tauri && cargo test state -- --nocapture`
Expected: all tests PASS (types are implemented inline)

**Step 3: Commit**

```bash
git add src-tauri/src/state.rs src-tauri/src/lib.rs
git commit -m "feat: add download state manager with JSON persistence"
```

---

## Task 6: Rust — Download Engine Module

**Files:**
- Create: `src-tauri/src/download_engine.rs`
- Modify: `src-tauri/src/lib.rs` (add `mod download_engine;`)

**Step 1: Implement download engine**

This module ties S3 client, MD5, and state together. It's integration-heavy, so tests will be at the command level. Focus on structure:

In `src-tauri/src/download_engine.rs`:
```rust
use crate::md5_engine;
use crate::s3_client::{self, S3FileInfo};
use crate::state::{DownloadState, FileState, FileStatus};
use aws_sdk_s3::Client;
use md5::{Md5, Digest};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::AsyncWriteExt;
use tokio::sync::Semaphore;

#[derive(Debug, Clone, serde::Serialize)]
pub struct ProgressEvent {
    pub file_key: String,
    pub downloaded: u64,
    pub total: u64,
    pub speed_bps: u64,
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct OverallProgress {
    pub total_files: usize,
    pub completed_files: usize,
    pub total_bytes: u64,
    pub downloaded_bytes: u64,
    pub speed_bps: u64,
    pub phase: String, // "listing", "downloading", "verifying", "done"
}

#[derive(Debug, Clone, serde::Serialize)]
pub struct VerifyResult {
    pub file_key: String,
    pub status: String, // "match", "mismatch", "no_md5"
    pub expected: Option<String>,
    pub calculated: Option<String>,
}

pub async fn run_download(
    app: AppHandle,
    client: Client,
    bucket: String,
    project: String,
    save_path: String,
    concurrency: usize,
) -> Result<Vec<VerifyResult>, String> {
    // 1. List files
    app.emit("overall-progress", OverallProgress {
        total_files: 0, completed_files: 0,
        total_bytes: 0, downloaded_bytes: 0,
        speed_bps: 0, phase: "listing".to_string(),
    }).ok();

    let all_files = s3_client::list_project_files(&client, &bucket, &project).await?;

    let md5_files: Vec<&S3FileInfo> = all_files.iter().filter(|f| f.is_md5_file).collect();
    let data_files: Vec<&S3FileInfo> = all_files.iter().filter(|f| !f.is_md5_file).collect();

    // 2. Download and parse MD5 files
    let mut md5_map: HashMap<String, String> = HashMap::new();
    for mf in &md5_files {
        let resp = client.get_object()
            .bucket(&bucket)
            .key(&mf.key)
            .send().await
            .map_err(|e| format!("Failed to download MD5 file {}: {}", mf.key, e))?;
        let bytes = resp.body.collect().await
            .map_err(|e| format!("Failed to read MD5 file: {}", e))?
            .into_bytes();
        let content = String::from_utf8_lossy(&bytes);
        md5_map.extend(md5_engine::parse_md5_content(&content));
    }

    // 3. Initialize or resume state
    let mut state = DownloadState::load(&project)
        .unwrap_or(None)
        .filter(|s| s.save_path == save_path)
        .unwrap_or_else(|| DownloadState::new(&project, &bucket, "", &save_path));

    // Create save directory
    std::fs::create_dir_all(&save_path)
        .map_err(|e| format!("Cannot create directory: {}", e))?;

    for f in &data_files {
        let basename = f.key.rsplit('/').next().unwrap_or(&f.key);
        if !state.files.contains_key(basename) ||
            state.files[basename].status == FileStatus::Failed {
            state.files.insert(basename.to_string(), FileState {
                size: f.size,
                downloaded: 0,
                md5_expected: md5_map.get(basename).cloned(),
                md5_calculated: None,
                status: FileStatus::Pending,
            });
        }
    }
    state.save()?;

    // 4. Download files concurrently
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let app_handle = Arc::new(app.clone());
    let client = Arc::new(client);
    let state_arc = Arc::new(tokio::sync::Mutex::new(state));

    let mut handles = vec![];

    for f in &data_files {
        let basename = f.key.rsplit('/').next().unwrap_or(&f.key).to_string();
        let key = f.key.clone();
        let size = f.size;

        // Skip already verified/downloaded files
        {
            let st = state_arc.lock().await;
            if let Some(fs) = st.files.get(&basename) {
                if fs.status == FileStatus::Verified || fs.status == FileStatus::Downloaded {
                    continue;
                }
            }
        }

        let sem = semaphore.clone();
        let app_h = app_handle.clone();
        let client_c = client.clone();
        let bucket_c = bucket.clone();
        let save_c = save_path.clone();
        let state_c = state_arc.clone();

        let handle = tokio::spawn(async move {
            let _permit = sem.acquire().await.map_err(|e| e.to_string())?;

            // Update status
            {
                let mut st = state_c.lock().await;
                if let Some(fs) = st.files.get_mut(&basename) {
                    fs.status = FileStatus::Downloading;
                }
            }

            let file_path = Path::new(&save_c).join(&basename);
            let mut file = tokio::fs::File::create(&file_path).await
                .map_err(|e| format!("Cannot create file {}: {}", basename, e))?;

            // Check for resume: if file exists partially, use Range header
            let existing_size = tokio::fs::metadata(&file_path).await
                .map(|m| m.len()).unwrap_or(0);

            let mut req = client_c.get_object().bucket(&bucket_c).key(&key);
            let start_byte = if existing_size > 0 && existing_size < size {
                req = req.range(format!("bytes={}-", existing_size));
                file = tokio::fs::OpenOptions::new()
                    .append(true).open(&file_path).await
                    .map_err(|e| format!("Cannot open file for append: {}", e))?;
                existing_size
            } else {
                0u64
            };

            let resp = req.send().await
                .map_err(|e| format!("S3 download error for {}: {}", basename, e))?;

            let mut stream = resp.body;
            let mut hasher = Md5::new();
            let mut downloaded = start_byte;
            let start_time = std::time::Instant::now();

            // If resuming, we need to hash the existing part first
            if start_byte > 0 {
                let existing_data = tokio::fs::read(&file_path).await
                    .map_err(|e| format!("Cannot read existing file: {}", e))?;
                hasher.update(&existing_data[..start_byte as usize]);
            }

            while let Some(chunk) = stream.try_next().await
                .map_err(|e| format!("Stream error: {}", e))? {
                file.write_all(&chunk).await
                    .map_err(|e| format!("Write error: {}", e))?;
                hasher.update(&chunk);
                downloaded += chunk.len() as u64;

                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    ((downloaded - start_byte) as f64 / elapsed) as u64
                } else { 0 };

                app_h.emit("file-progress", ProgressEvent {
                    file_key: basename.clone(),
                    downloaded,
                    total: size,
                    speed_bps: speed,
                }).ok();

                // Periodically save state
                if downloaded % (10 * 1024 * 1024) < chunk.len() as u64 {
                    let mut st = state_c.lock().await;
                    if let Some(fs) = st.files.get_mut(&basename) {
                        fs.downloaded = downloaded;
                    }
                    st.save().ok();
                }
            }

            file.flush().await.map_err(|e| format!("Flush error: {}", e))?;

            let md5_hex = format!("{:x}", hasher.finalize());

            // Update state
            {
                let mut st = state_c.lock().await;
                if let Some(fs) = st.files.get_mut(&basename) {
                    fs.downloaded = downloaded;
                    fs.md5_calculated = Some(md5_hex.clone());
                    fs.status = FileStatus::Downloaded;
                }
                st.save().ok();
            }

            Ok::<(String, String), String>((basename, md5_hex))
        });

        handles.push(handle);
    }

    // 5. Collect results and verify
    let mut results = Vec::new();

    for handle in handles {
        match handle.await {
            Ok(Ok((basename, md5_calc))) => {
                let mut st = state_arc.lock().await;
                let file_state = st.files.get_mut(&basename);

                let (status, expected) = if let Some(fs) = file_state {
                    if let Some(ref expected) = fs.md5_expected {
                        if expected == &md5_calc {
                            fs.status = FileStatus::Verified;
                            ("match".to_string(), Some(expected.clone()))
                        } else {
                            fs.status = FileStatus::Failed;
                            ("mismatch".to_string(), Some(expected.clone()))
                        }
                    } else {
                        fs.status = FileStatus::Downloaded;
                        ("no_md5".to_string(), None)
                    }
                } else {
                    ("no_md5".to_string(), None)
                };

                st.save().ok();
                results.push(VerifyResult {
                    file_key: basename,
                    status,
                    expected,
                    calculated: Some(md5_calc),
                });
            }
            Ok(Err(e)) => {
                results.push(VerifyResult {
                    file_key: "unknown".to_string(),
                    status: format!("error: {}", e),
                    expected: None,
                    calculated: None,
                });
            }
            Err(e) => {
                results.push(VerifyResult {
                    file_key: "unknown".to_string(),
                    status: format!("task error: {}", e),
                    expected: None,
                    calculated: None,
                });
            }
        }
    }

    app.emit("overall-progress", OverallProgress {
        total_files: data_files.len(),
        completed_files: results.len(),
        total_bytes: data_files.iter().map(|f| f.size).sum(),
        downloaded_bytes: data_files.iter().map(|f| f.size).sum(),
        speed_bps: 0,
        phase: "done".to_string(),
    }).ok();

    Ok(results)
}
```

**Step 2: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

**Step 3: Commit**

```bash
git add src-tauri/src/download_engine.rs src-tauri/src/lib.rs
git commit -m "feat: add download engine with parallel downloads and streaming MD5"
```

---

## Task 7: Rust — Tauri Commands (IPC Layer)

**Files:**
- Create: `src-tauri/src/commands.rs`
- Modify: `src-tauri/src/lib.rs` (register commands + deep link handler)

**Step 1: Implement Tauri commands**

In `src-tauri/src/commands.rs`:
```rust
use crate::download_engine::{self, VerifyResult};
use crate::s3_client;
use crate::url_parser::{self, DownloadParams};
use crate::state::DownloadState;
use serde::Serialize;
use tauri::AppHandle;

#[derive(Debug, Clone, Serialize)]
pub struct ProjectInfo {
    pub project: String,
    pub bucket: String,
    pub region: String,
    pub expires: Option<String>,
    pub files: Vec<FileInfo>,
    pub total_size: u64,
    pub has_existing_state: bool,
}

#[derive(Debug, Clone, Serialize)]
pub struct FileInfo {
    pub name: String,
    pub size: u64,
    pub is_md5_file: bool,
}

#[tauri::command]
pub async fn parse_download_url(url: String) -> Result<DownloadParams, String> {
    url_parser::parse_deep_link(&url)
}

#[tauri::command]
pub async fn fetch_project_info(params: DownloadParams) -> Result<ProjectInfo, String> {
    let client = s3_client::create_client(
        &params.access_key, &params.secret_key, &params.region,
    );

    let s3_files = s3_client::list_project_files(
        &client, &params.bucket, &params.project,
    ).await?;

    let files: Vec<FileInfo> = s3_files.iter().map(|f| {
        let name = f.key.rsplit('/').next().unwrap_or(&f.key).to_string();
        FileInfo { name, size: f.size, is_md5_file: f.is_md5_file }
    }).collect();

    let total_size = files.iter().filter(|f| !f.is_md5_file).map(|f| f.size).sum();
    let has_existing_state = DownloadState::load(&params.project)
        .unwrap_or(None).is_some();

    Ok(ProjectInfo {
        project: params.project,
        bucket: params.bucket,
        region: params.region,
        expires: params.expires,
        files,
        total_size,
        has_existing_state,
    })
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    params: DownloadParams,
    save_path: String,
    concurrency: Option<usize>,
) -> Result<Vec<VerifyResult>, String> {
    let client = s3_client::create_client(
        &params.access_key, &params.secret_key, &params.region,
    );

    download_engine::run_download(
        app,
        client,
        params.bucket,
        params.project,
        save_path,
        concurrency.unwrap_or(3),
    ).await
}
```

**Step 2: Wire up `lib.rs`**

In `src-tauri/src/lib.rs`:
```rust
mod commands;
mod download_engine;
mod md5_engine;
mod s3_client;
mod state;
mod url_parser;

use tauri_plugin_deep_link::DeepLinkExt;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_shell::init())
        .setup(|app| {
            // Handle deep links on launch
            if let Ok(Some(urls)) = app.deep_link().get_current() {
                if let Some(url) = urls.first() {
                    app.emit("deep-link", url.as_str()).ok();
                }
            }

            // Handle deep links while running
            let app_handle = app.handle().clone();
            app.deep_link().on_open_url(move |event| {
                if let Some(url) = event.urls().first() {
                    app_handle.emit("deep-link", url.as_str()).ok();
                }
            });

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::parse_download_url,
            commands::fetch_project_info,
            commands::start_download,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

**Step 3: Verify it compiles**

Run: `cd src-tauri && cargo check`
Expected: compiles without errors

**Step 4: Commit**

```bash
git add src-tauri/src/commands.rs src-tauri/src/lib.rs
git commit -m "feat: add Tauri IPC commands and deep link handler"
```

---

## Task 8: Frontend — i18n Setup

**Files:**
- Create: `src/i18n/ja.json`, `src/i18n/en.json`, `src/i18n/zh.json`, `src/i18n/index.ts`
- Modify: `src/main.tsx`

**Step 1: Create translation files**

`src/i18n/ja.json`:
```json
{
  "app_name": "OneStepAWS",
  "project_info": {
    "title": "プロジェクト情報",
    "file_count": "ファイル数",
    "total_size": "合計サイズ",
    "expires": "ダウンロード期限",
    "days_left": "残り{{days}}日",
    "expired": "期限切れ",
    "save_to": "保存先",
    "change": "変更",
    "start_download": "ダウンロード開始",
    "resume_download": "ダウンロード再開"
  },
  "download": {
    "title": "ダウンロード中",
    "overall_progress": "全体進捗",
    "speed": "速度",
    "remaining": "残り時間",
    "about_minutes": "約{{minutes}}分",
    "pause": "一時停止",
    "resume": "再開",
    "cancel": "キャンセル",
    "status_done": "完了",
    "status_downloading": "ダウンロード中",
    "status_waiting": "待機",
    "status_failed": "失敗",
    "cancel_confirm": "ダウンロードを中止してもよろしいですか？"
  },
  "verify": {
    "title": "ダウンロード＆検証完了",
    "total": "合計",
    "success": "成功",
    "failed": "失敗",
    "items": "件",
    "md5_match": "MD5一致",
    "md5_mismatch": "MD5不一致",
    "md5_none": "MD5情報なし",
    "retry_failed": "失敗ファイルを再ダウンロード",
    "open_folder": "フォルダを開く"
  },
  "error": {
    "expired_title": "リンクの有効期限切れ",
    "expired_message": "このダウンロードリンクは{{date}}に有効期限が切れました。データ提供元にお問い合わせください。",
    "connection_failed": "S3への接続に失敗しました。ネットワーク接続をご確認ください。",
    "invalid_url": "無効なダウンロードリンクです。"
  }
}
```

`src/i18n/en.json`:
```json
{
  "app_name": "OneStepAWS",
  "project_info": {
    "title": "Project Information",
    "file_count": "Files",
    "total_size": "Total Size",
    "expires": "Download Deadline",
    "days_left": "{{days}} days left",
    "expired": "Expired",
    "save_to": "Save to",
    "change": "Change",
    "start_download": "Start Download",
    "resume_download": "Resume Download"
  },
  "download": {
    "title": "Downloading",
    "overall_progress": "Overall Progress",
    "speed": "Speed",
    "remaining": "Remaining",
    "about_minutes": "~{{minutes}} min",
    "pause": "Pause",
    "resume": "Resume",
    "cancel": "Cancel",
    "status_done": "Done",
    "status_downloading": "Downloading",
    "status_waiting": "Waiting",
    "status_failed": "Failed",
    "cancel_confirm": "Are you sure you want to cancel the download?"
  },
  "verify": {
    "title": "Download & Verification Complete",
    "total": "Total",
    "success": "Success",
    "failed": "Failed",
    "items": "",
    "md5_match": "MD5 Match",
    "md5_mismatch": "MD5 Mismatch",
    "md5_none": "No MD5 Info",
    "retry_failed": "Retry Failed Files",
    "open_folder": "Open Folder"
  },
  "error": {
    "expired_title": "Link Expired",
    "expired_message": "This download link expired on {{date}}. Please contact the data provider.",
    "connection_failed": "Failed to connect to S3. Please check your network.",
    "invalid_url": "Invalid download link."
  }
}
```

`src/i18n/zh.json`:
```json
{
  "app_name": "OneStepAWS",
  "project_info": {
    "title": "项目信息",
    "file_count": "文件数",
    "total_size": "总大小",
    "expires": "下载截止日期",
    "days_left": "剩余{{days}}天",
    "expired": "已过期",
    "save_to": "保存至",
    "change": "更改",
    "start_download": "开始下载",
    "resume_download": "恢复下载"
  },
  "download": {
    "title": "下载中",
    "overall_progress": "整体进度",
    "speed": "速度",
    "remaining": "剩余时间",
    "about_minutes": "约{{minutes}}分钟",
    "pause": "暂停",
    "resume": "继续",
    "cancel": "取消",
    "status_done": "完成",
    "status_downloading": "下载中",
    "status_waiting": "等待",
    "status_failed": "失败",
    "cancel_confirm": "确定要取消下载吗？"
  },
  "verify": {
    "title": "下载与校验完成",
    "total": "总计",
    "success": "成功",
    "failed": "失败",
    "items": "个",
    "md5_match": "MD5一致",
    "md5_mismatch": "MD5不一致",
    "md5_none": "无MD5信息",
    "retry_failed": "重新下载失败文件",
    "open_folder": "打开文件夹"
  },
  "error": {
    "expired_title": "链接已过期",
    "expired_message": "此下载链接已于{{date}}过期。请联系数据提供方。",
    "connection_failed": "无法连接到S3，请检查网络连接。",
    "invalid_url": "无效的下载链接。"
  }
}
```

**Step 2: Create i18n init file**

`src/i18n/index.ts`:
```typescript
import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import ja from "./ja.json";
import en from "./en.json";
import zh from "./zh.json";

const systemLang = navigator.language.toLowerCase();
const defaultLng = systemLang.startsWith("ja") ? "ja"
  : systemLang.startsWith("zh") ? "zh"
  : "en";

i18n.use(initReactI18next).init({
  resources: { ja: { translation: ja }, en: { translation: en }, zh: { translation: zh } },
  lng: defaultLng,
  fallbackLng: "en",
  interpolation: { escapeValue: false },
});

export default i18n;
```

**Step 3: Import in `src/main.tsx`**

Add `import "./i18n";` at the top of `src/main.tsx`.

**Step 4: Verify it compiles**

Run: `npm run dev` (frontend only)
Expected: no errors

**Step 5: Commit**

```bash
git add src/i18n/ src/main.tsx
git commit -m "feat: add i18n with Japanese, English, Chinese translations"
```

---

## Task 9: Frontend — Project Info Page

**Files:**
- Create: `src/pages/ProjectInfo.tsx`
- Create: `src/lib/tauri-api.ts`
- Create: `src/lib/format.ts`
- Modify: `src/App.tsx`

**Step 1: Create Tauri API wrapper**

`src/lib/tauri-api.ts`:
```typescript
import { invoke } from "@tauri-apps/api/core";

export interface DownloadParams {
  access_key: string;
  secret_key: string;
  bucket: string;
  region: string;
  project: string;
  expires: string | null;
}

export interface FileInfo {
  name: string;
  size: number;
  is_md5_file: boolean;
}

export interface ProjectInfo {
  project: string;
  bucket: string;
  region: string;
  expires: string | null;
  files: FileInfo[];
  total_size: number;
  has_existing_state: boolean;
}

export interface VerifyResult {
  file_key: string;
  status: string;
  expected: string | null;
  calculated: string | null;
}

export function parseDownloadUrl(url: string): Promise<DownloadParams> {
  return invoke("parse_download_url", { url });
}

export function fetchProjectInfo(params: DownloadParams): Promise<ProjectInfo> {
  return invoke("fetch_project_info", { params });
}

export function startDownload(
  params: DownloadParams,
  savePath: string,
  concurrency?: number
): Promise<VerifyResult[]> {
  return invoke("start_download", { params, savePath, concurrency });
}
```

**Step 2: Create format utils**

`src/lib/format.ts`:
```typescript
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  return Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}
```

**Step 3: Create ProjectInfo page**

`src/pages/ProjectInfo.tsx`:
```tsx
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-dialog";
import { DownloadParams, ProjectInfo as ProjectInfoType } from "../lib/tauri-api";
import { formatBytes, daysUntil } from "../lib/format";

interface Props {
  params: DownloadParams;
  info: ProjectInfoType;
  onStartDownload: (savePath: string) => void;
}

export default function ProjectInfo({ params, info, onStartDownload }: Props) {
  const { t } = useTranslation();
  const downloadDir = `${info.project}`;
  const [savePath, setSavePath] = useState<string>("");

  const dataFiles = info.files.filter((f) => !f.is_md5_file);
  const days = info.expires ? daysUntil(info.expires) : null;

  const handleChangePath = async () => {
    const selected = await open({ directory: true });
    if (selected) setSavePath(selected as string);
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-6">{t("project_info.title")}</h1>

      <div className="space-y-3 mb-6">
        <div className="flex justify-between">
          <span className="text-gray-500">{t("project_info.file_count")}</span>
          <span className="font-mono">{dataFiles.length}</span>
        </div>
        <div className="flex justify-between">
          <span className="text-gray-500">{t("project_info.total_size")}</span>
          <span className="font-mono">{formatBytes(info.total_size)}</span>
        </div>
        {info.expires && (
          <div className="flex justify-between">
            <span className="text-gray-500">{t("project_info.expires")}</span>
            <span className={`font-mono ${days !== null && days < 3 ? "text-red-500" : ""}`}>
              {info.expires}
              {days !== null && days > 0
                ? ` (${t("project_info.days_left", { days })})`
                : ` (${t("project_info.expired")})`}
            </span>
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 p-3 bg-gray-50 rounded mb-6">
        <span className="text-gray-500 text-sm">{t("project_info.save_to")}:</span>
        <span className="flex-1 font-mono text-sm truncate">
          {savePath || `~/Downloads/${downloadDir}`}
        </span>
        <button
          onClick={handleChangePath}
          className="text-sm text-blue-600 hover:underline"
        >
          {t("project_info.change")}
        </button>
      </div>

      <div className="mt-auto">
        <button
          onClick={() => onStartDownload(savePath || `~/Downloads/${downloadDir}`)}
          disabled={days !== null && days <= 0}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
        >
          {info.has_existing_state
            ? t("project_info.resume_download")
            : t("project_info.start_download")}
        </button>
      </div>
    </div>
  );
}
```

**Step 4: Commit**

```bash
git add src/pages/ProjectInfo.tsx src/lib/tauri-api.ts src/lib/format.ts
git commit -m "feat: add project info page with i18n and folder picker"
```

---

## Task 10: Frontend — Download Progress Page

**Files:**
- Create: `src/pages/DownloadProgress.tsx`

**Step 1: Implement progress page**

`src/pages/DownloadProgress.tsx`:
```tsx
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import { formatBytes } from "../lib/format";

interface FileProgress {
  file_key: string;
  downloaded: number;
  total: number;
  speed_bps: number;
}

interface OverallProgress {
  total_files: number;
  completed_files: number;
  total_bytes: number;
  downloaded_bytes: number;
  speed_bps: number;
  phase: string;
}

interface Props {
  onComplete: () => void;
}

export default function DownloadProgress({ onComplete }: Props) {
  const { t } = useTranslation();
  const [overall, setOverall] = useState<OverallProgress>({
    total_files: 0, completed_files: 0,
    total_bytes: 0, downloaded_bytes: 0,
    speed_bps: 0, phase: "listing",
  });
  const [fileProgress, setFileProgress] = useState<Map<string, FileProgress>>(new Map());

  useEffect(() => {
    const unlisteners: (() => void)[] = [];

    (async () => {
      unlisteners.push(
        await listen<OverallProgress>("overall-progress", (e) => {
          setOverall(e.payload);
          if (e.payload.phase === "done") onComplete();
        })
      );
      unlisteners.push(
        await listen<FileProgress>("file-progress", (e) => {
          setFileProgress((prev) => {
            const next = new Map(prev);
            next.set(e.payload.file_key, e.payload);
            return next;
          });
        })
      );
    })();

    return () => unlisteners.forEach((fn) => fn());
  }, [onComplete]);

  const pct = overall.total_bytes > 0
    ? Math.round((overall.downloaded_bytes / overall.total_bytes) * 100)
    : 0;

  const remainingMin = overall.speed_bps > 0
    ? Math.ceil((overall.total_bytes - overall.downloaded_bytes) / overall.speed_bps / 60)
    : 0;

  const sortedFiles = Array.from(fileProgress.values()).sort((a, b) => {
    const pctA = a.total > 0 ? a.downloaded / a.total : 0;
    const pctB = b.total > 0 ? b.downloaded / b.total : 0;
    return pctB - pctA;
  });

  const statusIcon = (fp: FileProgress) => {
    if (fp.downloaded >= fp.total) return "✅";
    if (fp.downloaded > 0) return "⬇️";
    return "⏳";
  };

  const statusText = (fp: FileProgress) => {
    if (fp.downloaded >= fp.total) return t("download.status_done");
    if (fp.downloaded > 0)
      return `${Math.round((fp.downloaded / fp.total) * 100)}%`;
    return t("download.status_waiting");
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-4">{t("download.title")}</h1>

      <div className="mb-2 text-sm text-gray-600">
        {t("download.overall_progress")}: {pct}%
        ({formatBytes(overall.downloaded_bytes)} / {formatBytes(overall.total_bytes)})
      </div>

      <div className="w-full bg-gray-200 rounded-full h-3 mb-2">
        <div
          className="bg-blue-600 h-3 rounded-full transition-all duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="flex justify-between text-sm text-gray-500 mb-4">
        <span>{t("download.speed")}: {formatBytes(overall.speed_bps)}/s</span>
        <span>{t("download.remaining")}: {t("download.about_minutes", { minutes: remainingMin })}</span>
      </div>

      <div className="flex-1 overflow-y-auto border rounded">
        {sortedFiles.map((fp) => (
          <div key={fp.file_key} className="flex items-center px-3 py-2 border-b last:border-b-0 text-sm">
            <span className="mr-2">{statusIcon(fp)}</span>
            <span className="flex-1 font-mono truncate">{fp.file_key}</span>
            <span className="text-gray-500 ml-2 w-16 text-right">{formatBytes(fp.total)}</span>
            <span className="ml-2 w-12 text-right">{statusText(fp)}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/DownloadProgress.tsx
git commit -m "feat: add download progress page with real-time updates"
```

---

## Task 11: Frontend — Verification Result Page

**Files:**
- Create: `src/pages/VerifyResult.tsx`

**Step 1: Implement verify result page**

`src/pages/VerifyResult.tsx`:
```tsx
import { useTranslation } from "react-i18next";
import { open } from "@tauri-apps/plugin-shell";
import { VerifyResult as VerifyResultType } from "../lib/tauri-api";

interface Props {
  results: VerifyResultType[];
  savePath: string;
  onRetryFailed: () => void;
}

export default function VerifyResult({ results, savePath, onRetryFailed }: Props) {
  const { t } = useTranslation();

  const matched = results.filter((r) => r.status === "match");
  const mismatched = results.filter((r) => r.status === "mismatch");
  const noMd5 = results.filter((r) => r.status === "no_md5");
  const hasFailed = mismatched.length > 0;

  const statusIcon = (status: string) => {
    if (status === "match") return "✅";
    if (status === "mismatch") return "❌";
    if (status === "no_md5") return "⚠️";
    return "❓";
  };

  const statusText = (status: string) => {
    if (status === "match") return t("verify.md5_match");
    if (status === "mismatch") return t("verify.md5_mismatch");
    if (status === "no_md5") return t("verify.md5_none");
    return status;
  };

  return (
    <div className="flex flex-col h-full p-6">
      <h1 className="text-xl font-bold mb-4">
        {hasFailed ? "⚠️" : "✅"} {t("verify.title")}
      </h1>

      <div className="flex gap-4 mb-4 text-sm">
        <span>
          {t("verify.total")}: {results.length}{t("verify.items")}
        </span>
        <span className="text-green-600">
          {t("verify.success")}: {matched.length + noMd5.length}{t("verify.items")}
        </span>
        {hasFailed && (
          <span className="text-red-600">
            {t("verify.failed")}: {mismatched.length}{t("verify.items")}
          </span>
        )}
      </div>

      <div className="flex-1 overflow-y-auto border rounded mb-4">
        {results.map((r) => (
          <div
            key={r.file_key}
            className={`flex items-center px-3 py-2 border-b last:border-b-0 text-sm ${
              r.status === "mismatch" ? "bg-red-50" : ""
            }`}
          >
            <span className="mr-2">{statusIcon(r.status)}</span>
            <span className="flex-1 font-mono truncate">{r.file_key}</span>
            <span className={`ml-2 ${
              r.status === "mismatch" ? "text-red-600" : "text-gray-500"
            }`}>
              {statusText(r.status)}
            </span>
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        {hasFailed && (
          <button
            onClick={onRetryFailed}
            className="flex-1 py-3 bg-red-600 text-white rounded-lg font-medium hover:bg-red-700"
          >
            {t("verify.retry_failed")}
          </button>
        )}
        <button
          onClick={() => open(savePath)}
          className="flex-1 py-3 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
        >
          {t("verify.open_folder")}
        </button>
      </div>
    </div>
  );
}
```

**Step 2: Commit**

```bash
git add src/pages/VerifyResult.tsx
git commit -m "feat: add verification result page with retry support"
```

---

## Task 12: Frontend — App Shell & Deep Link Integration

**Files:**
- Modify: `src/App.tsx`

**Step 1: Implement App shell with page routing and deep link handling**

`src/App.tsx`:
```tsx
import { useEffect, useState, useCallback } from "react";
import { useTranslation } from "react-i18next";
import { listen } from "@tauri-apps/api/event";
import {
  DownloadParams,
  ProjectInfo as ProjectInfoType,
  VerifyResult as VerifyResultType,
  parseDownloadUrl,
  fetchProjectInfo,
  startDownload,
} from "./lib/tauri-api";
import ProjectInfo from "./pages/ProjectInfo";
import DownloadProgress from "./pages/DownloadProgress";
import VerifyResult from "./pages/VerifyResult";

type Page = "loading" | "project-info" | "downloading" | "results" | "error";

export default function App() {
  const { t } = useTranslation();
  const [page, setPage] = useState<Page>("loading");
  const [params, setParams] = useState<DownloadParams | null>(null);
  const [projectInfo, setProjectInfo] = useState<ProjectInfoType | null>(null);
  const [results, setResults] = useState<VerifyResultType[]>([]);
  const [savePath, setSavePath] = useState("");
  const [error, setError] = useState("");

  const handleDeepLink = useCallback(async (url: string) => {
    try {
      setPage("loading");
      const p = await parseDownloadUrl(url);
      setParams(p);

      // Check expiry
      if (p.expires) {
        const expDate = new Date(p.expires);
        if (expDate < new Date()) {
          setError(t("error.expired_message", { date: p.expires }));
          setPage("error");
          return;
        }
      }

      const info = await fetchProjectInfo(p);
      setProjectInfo(info);
      setPage("project-info");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  }, [t]);

  useEffect(() => {
    let unlisteners: (() => void)[] = [];
    (async () => {
      unlisteners.push(
        await listen<string>("deep-link", (e) => {
          handleDeepLink(e.payload);
        })
      );
    })();
    return () => unlisteners.forEach((fn) => fn());
  }, [handleDeepLink]);

  const handleStartDownload = async (path: string) => {
    if (!params) return;
    setSavePath(path);
    setPage("downloading");
    try {
      const r = await startDownload(params, path);
      setResults(r);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  };

  const handleRetryFailed = async () => {
    if (!params) return;
    setPage("downloading");
    try {
      const r = await startDownload(params, savePath);
      setResults(r);
      setPage("results");
    } catch (e) {
      setError(String(e));
      setPage("error");
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white text-gray-900">
      <div className="h-8 flex items-center px-4 bg-gray-50 border-b text-sm font-medium select-none"
        data-tauri-drag-region>
        {t("app_name")}
        {projectInfo && (
          <span className="ml-2 text-gray-400">— {projectInfo.project}</span>
        )}
      </div>

      <div className="flex-1 overflow-hidden">
        {page === "loading" && (
          <div className="flex items-center justify-center h-full text-gray-400">
            <p>{t("app_name")}</p>
          </div>
        )}

        {page === "project-info" && params && projectInfo && (
          <ProjectInfo
            params={params}
            info={projectInfo}
            onStartDownload={handleStartDownload}
          />
        )}

        {page === "downloading" && (
          <DownloadProgress onComplete={() => {}} />
        )}

        {page === "results" && (
          <VerifyResult
            results={results}
            savePath={savePath}
            onRetryFailed={handleRetryFailed}
          />
        )}

        {page === "error" && (
          <div className="flex flex-col items-center justify-center h-full p-6">
            <p className="text-red-600 text-center">{error}</p>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Step 2: Verify it compiles**

Run: `npm run tauri dev`
Expected: app opens, shows loading screen. Deep link would trigger the flow.

**Step 3: Commit**

```bash
git add src/App.tsx
git commit -m "feat: add app shell with deep link integration and page routing"
```

---

## Task 13: Build & Distribution Setup

**Files:**
- Create: `.github/workflows/build.yml`
- Modify: `src-tauri/tauri.conf.json` (icons, bundle config)

**Step 1: Create GitHub Actions workflow**

`.github/workflows/build.yml`:
```yaml
name: Build & Release

on:
  push:
    tags:
      - "v*"

jobs:
  build:
    strategy:
      matrix:
        include:
          - platform: macos-latest
            target: aarch64-apple-darwin
          - platform: macos-latest
            target: x86_64-apple-darwin
          - platform: windows-latest
            target: x86_64-pc-windows-msvc

    runs-on: ${{ matrix.platform }}

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 20

      - uses: dtolnay/rust-toolchain@stable
        with:
          targets: ${{ matrix.target }}

      - run: npm install

      - uses: tauri-apps/tauri-action@v0
        env:
          GITHUB_TOKEN: ${{ secrets.GITHUB_TOKEN }}
        with:
          tagName: ${{ github.ref_name }}
          releaseName: "OneStepAWS ${{ github.ref_name }}"
          releaseBody: "See release notes in CHANGELOG.md"
          releaseDraft: true
          args: --target ${{ matrix.target }}
```

**Step 2: Update bundle config in `tauri.conf.json`**

Ensure `bundle` section has correct settings:
```json
{
  "bundle": {
    "active": true,
    "targets": "all",
    "icon": [
      "icons/32x32.png",
      "icons/128x128.png",
      "icons/128x128@2x.png",
      "icons/icon.icns",
      "icons/icon.ico"
    ]
  }
}
```

**Step 3: Commit**

```bash
git add .github/workflows/build.yml src-tauri/tauri.conf.json
git commit -m "feat: add GitHub Actions CI/CD for multi-platform builds"
```

---

## Summary

| Task | Description | Est. Complexity |
|------|-------------|-----------------|
| 1 | Project scaffolding | Low |
| 2 | URL parser (Rust, TDD) | Low |
| 3 | S3 client (Rust) | Medium |
| 4 | MD5 engine (Rust, TDD) | Low |
| 5 | State manager (Rust, TDD) | Low |
| 6 | Download engine (Rust) | High |
| 7 | Tauri commands + deep link | Medium |
| 8 | i18n setup (3 languages) | Low |
| 9 | Project info page | Medium |
| 10 | Download progress page | Medium |
| 11 | Verify result page | Low |
| 12 | App shell + routing | Medium |
| 13 | CI/CD build pipeline | Low |

Dependencies: Task 1 must complete first. Tasks 2-5 can run in parallel. Task 6 depends on 2-5. Task 7 depends on 6. Tasks 8-11 can run in parallel after Task 1. Task 12 depends on 7-11. Task 13 is independent.
