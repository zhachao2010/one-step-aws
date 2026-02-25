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
