use aws_config::Region;
use aws_credential_types::Credentials;
use aws_sdk_s3::config::BehaviorVersion;
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
        .behavior_version(BehaviorVersion::latest())
        .region(Region::new(region.to_string()))
        .credentials_provider(credentials)
        .build();
    Client::from_conf(config)
}

pub fn is_md5_file(key: &str) -> bool {
    let lower = key.to_lowercase();
    lower.ends_with(".md5")
        || lower.ends_with("md5.txt")
        || lower.ends_with("md5sum.txt")
}

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

        let resp = req.send().await.map_err(|e| {
            let msg = e.to_string();
            if msg.contains("InvalidAccessKeyId") {
                "Invalid AWS Access Key. Please check your credentials.".to_string()
            } else if msg.contains("SignatureDoesNotMatch") {
                "Invalid AWS Secret Key. Please check your credentials.".to_string()
            } else if msg.contains("AccessDenied") {
                "Access denied. The credentials do not have permission to access this bucket.".to_string()
            } else if msg.contains("NoSuchBucket") {
                "The specified S3 bucket does not exist.".to_string()
            } else {
                format!("S3 error: {}", msg)
            }
        })?;

        for obj in resp.contents() {
            let key = obj.key().unwrap_or_default().to_string();
            // Skip directory markers
            if key.ends_with('/') {
                continue;
            }
            let size = obj.size().unwrap_or(0) as u64;

            files.push(S3FileInfo {
                key: key.clone(),
                size,
                is_md5_file: is_md5_file(&key),
            });
        }

        if resp.is_truncated() == Some(true) {
            continuation_token = resp.next_continuation_token().map(|s| s.to_string());
        } else {
            break;
        }
    }

    Ok(files)
}

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
            assert_eq!(is_md5_file(key), expected, "Failed for key: {}", key);
        }
    }
}
