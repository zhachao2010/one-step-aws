use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use std::path::PathBuf;

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
