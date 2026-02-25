use crate::md5_engine;
use crate::s3_client::{self, S3FileInfo};
use crate::state::{DownloadState, FileState, FileStatus};
use aws_sdk_s3::Client;
use md5::{Md5, Digest};
use std::collections::HashMap;
use std::path::Path;
use std::sync::Arc;
use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncReadExt, AsyncWriteExt};
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

    // Compute prefix for stripping to get relative paths
    let prefix = if project.ends_with('/') {
        project.clone()
    } else {
        format!("{}/", project)
    };

    // Create save directory
    std::fs::create_dir_all(&save_path)
        .map_err(|e| format!("Cannot create directory: {}", e))?;

    for f in &data_files {
        // Use relative path (strip project prefix) to preserve directory structure
        let rel_path = f.key.strip_prefix(&prefix).unwrap_or(&f.key).to_string();
        let basename = f.key.rsplit('/').next().unwrap_or(&f.key);
        if !state.files.contains_key(&rel_path) ||
            state.files[&rel_path].status == FileStatus::Failed {
            state.files.insert(rel_path, FileState {
                size: f.size,
                downloaded: 0,
                md5_expected: md5_map.get(basename).cloned(),
                md5_calculated: None,
                status: FileStatus::Pending,
            });
        }
    }
    state.save()?;

    // Emit correct totals before downloads begin
    let total_data_bytes: u64 = data_files.iter().map(|f| f.size).sum();
    app.emit("overall-progress", OverallProgress {
        total_files: data_files.len(),
        completed_files: 0,
        total_bytes: total_data_bytes,
        downloaded_bytes: 0,
        speed_bps: 0,
        phase: "downloading".to_string(),
    }).ok();

    // 4. Download files concurrently
    let semaphore = Arc::new(Semaphore::new(concurrency));
    let app_handle = Arc::new(app.clone());
    let client = Arc::new(client);
    let state_arc = Arc::new(tokio::sync::Mutex::new(state));

    let mut handles = vec![];

    for f in &data_files {
        let rel_path = f.key.strip_prefix(&prefix).unwrap_or(&f.key).to_string();
        let key = f.key.clone();
        let size = f.size;

        // Skip already verified/downloaded files
        {
            let st = state_arc.lock().await;
            if let Some(fs) = st.files.get(&rel_path) {
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
                if let Some(fs) = st.files.get_mut(&rel_path) {
                    fs.status = FileStatus::Downloading;
                }
            }

            // Preserve directory structure: join relative path with save dir
            let file_path = Path::new(&save_c).join(&rel_path);
            // Create parent directories if needed
            if let Some(parent) = file_path.parent() {
                tokio::fs::create_dir_all(parent).await
                    .map_err(|e| format!("Cannot create directory {}: {}", parent.display(), e))?;
            }

            // Check for resume: if file exists partially, use Range header
            let existing_size = tokio::fs::metadata(&file_path).await
                .map(|m| m.len()).unwrap_or(0);

            let mut req = client_c.get_object().bucket(&bucket_c).key(&key);
            let start_byte = if existing_size > 0 && existing_size < size {
                req = req.range(format!("bytes={}-", existing_size));
                existing_size
            } else {
                0u64
            };

            let resp = req.send().await
                .map_err(|e| format!("S3 download error for {}: {}", rel_path, e))?;

            // Open file for writing (append if resuming, create if new)
            let mut file = if start_byte > 0 {
                tokio::fs::OpenOptions::new()
                    .append(true).open(&file_path).await
                    .map_err(|e| format!("Cannot open file for append: {}", e))?
            } else {
                tokio::fs::File::create(&file_path).await
                    .map_err(|e| format!("Cannot create file {}: {}", rel_path, e))?
            };

            let mut reader = resp.body.into_async_read();
            let mut hasher = Md5::new();
            let mut downloaded = start_byte;
            let start_time = std::time::Instant::now();

            // If resuming, we need to hash the existing part first
            if start_byte > 0 {
                let existing_data = tokio::fs::read(&file_path).await
                    .map_err(|e| format!("Cannot read existing file: {}", e))?;
                hasher.update(&existing_data[..start_byte as usize]);
            }

            let mut buf = vec![0u8; 256 * 1024]; // 256KB chunks
            loop {
                let n = reader.read(&mut buf).await
                    .map_err(|e| format!("Stream error: {}", e))?;
                if n == 0 {
                    break;
                }
                let chunk = &buf[..n];
                file.write_all(chunk).await
                    .map_err(|e| format!("Write error: {}", e))?;
                hasher.update(chunk);
                downloaded += n as u64;

                let elapsed = start_time.elapsed().as_secs_f64();
                let speed = if elapsed > 0.0 {
                    ((downloaded - start_byte) as f64 / elapsed) as u64
                } else { 0 };

                app_h.emit("file-progress", ProgressEvent {
                    file_key: rel_path.clone(),
                    downloaded,
                    total: size,
                    speed_bps: speed,
                }).ok();

                // Periodically save state
                if downloaded % (10 * 1024 * 1024) < n as u64 {
                    let mut st = state_c.lock().await;
                    if let Some(fs) = st.files.get_mut(&rel_path) {
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
                if let Some(fs) = st.files.get_mut(&rel_path) {
                    fs.downloaded = downloaded;
                    fs.md5_calculated = Some(md5_hex.clone());
                    fs.status = FileStatus::Downloaded;
                }
                st.save().ok();
            }

            Ok::<(String, String), String>((rel_path, md5_hex))
        });

        handles.push(handle);
    }

    // 5. Collect results and verify
    let mut results = Vec::new();

    for handle in handles {
        match handle.await {
            Ok(Ok((rel_path, md5_calc))) => {
                let mut st = state_arc.lock().await;
                let file_state = st.files.get_mut(&rel_path);

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
                    file_key: rel_path,
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
