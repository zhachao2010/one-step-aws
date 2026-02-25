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

fn expand_tilde(path: &str) -> String {
    if path.starts_with("~/") {
        if let Some(home) = dirs::home_dir() {
            return format!("{}/{}", home.display(), &path[2..]);
        }
    }
    path.to_string()
}

#[tauri::command]
pub async fn start_download(
    app: AppHandle,
    params: DownloadParams,
    save_path: String,
    concurrency: Option<usize>,
) -> Result<Vec<VerifyResult>, String> {
    let save_path = expand_tilde(&save_path);
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
