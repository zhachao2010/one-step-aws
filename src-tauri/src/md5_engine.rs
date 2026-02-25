use md5::{Md5, Digest};
use std::collections::HashMap;

/// Parse MD5 checksums from file content.
/// Supports formats:
///   md5hash  filename
///   md5hash *filename
///   MD5 (filename) = md5hash
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
        let content = "abc123def456abc123def456abc123de  project/data/sample.fastq.gz\n";
        let map = parse_md5_content(content);
        // Should store with basename only
        assert_eq!(map.get("sample.fastq.gz").unwrap(), "abc123def456abc123def456abc123de");
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
