use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MediaFile {
    pub id: i64,
    pub file_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub width: i32,
    pub height: i32,
    pub taken_at: Option<DateTime<Utc>>,
    pub modified_at: DateTime<Utc>,
    pub thumbnail_path: Option<String>,
    pub media_type: MediaType,
    pub created_at: DateTime<Utc>,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum MediaType {
    Image,
    Video,
}

impl MediaFile {
    pub fn new(
        file_path: String,
        file_hash: String,
        file_size: i64,
        width: i32,
        height: i32,
        media_type: MediaType,
    ) -> Self {
        Self {
            id: 0,
            file_path,
            file_hash,
            file_size,
            width,
            height,
            taken_at: None,
            modified_at: Utc::now(),
            thumbnail_path: None,
            media_type,
            created_at: Utc::now(),
        }
    }
}

pub const IMAGE_EXTENSIONS: &[&str] = &["jpg", "jpeg", "png", "gif", "webp", "heic", "heif"];
pub const VIDEO_EXTENSIONS: &[&str] = &["mp4", "mov", "avi", "mkv", "webm", "m4v"];

pub fn is_media_file(path: &str) -> Option<MediaType> {
    let ext = std::path::Path::new(path)
        .extension()?
        .to_str()?
        .to_lowercase();

    if IMAGE_EXTENSIONS.contains(&ext.as_str()) {
        Some(MediaType::Image)
    } else if VIDEO_EXTENSIONS.contains(&ext.as_str()) {
        Some(MediaType::Video)
    } else {
        None
    }
}
