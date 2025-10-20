use std::fs::File;
use std::io::{BufReader, Read};
use std::path::Path;
use anyhow::Result;

/// Generate BLAKE3 hash for a file (fast and secure)
pub fn hash_file(path: &Path) -> Result<String> {
    let file = File::open(path)?;
    let mut reader = BufReader::new(file);
    let mut hasher = blake3::Hasher::new();
    let mut buffer = [0; 8192];

    loop {
        let count = reader.read(&mut buffer)?;
        if count == 0 {
            break;
        }
        hasher.update(&buffer[..count]);
    }

    Ok(hasher.finalize().to_hex().to_string())
}

/// Generate a shorter hash for cache keys (first 16 chars)
pub fn short_hash(full_hash: &str) -> String {
    full_hash.chars().take(16).collect()
}
