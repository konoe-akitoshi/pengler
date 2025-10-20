use std::path::{Path, PathBuf};
use std::collections::hash_map::DefaultHasher;
use std::hash::{Hash, Hasher};
use walkdir::WalkDir;
use rayon::prelude::*;
use anyhow::Result;

use crate::models::{MediaFile, MediaType, is_media_file};
use crate::utils::{hash_file, extract_date_taken, get_image_dimensions};

#[tauri::command]
pub async fn scan_folder(path: String) -> Result<Vec<MediaFile>, String> {
    println!("Scanning folder: {}", path);

    let folder_path = PathBuf::from(&path);
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    // Collect all media files
    let entries: Vec<PathBuf> = WalkDir::new(&folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter_map(|e| {
            let path = e.path();
            if is_media_file(path.to_str()?).is_some() {
                Some(path.to_path_buf())
            } else {
                None
            }
        })
        .collect();

    println!("Found {} media files", entries.len());

    // Process files in parallel
    let mut media_files: Vec<MediaFile> = entries
        .par_iter()
        .filter_map(|path| process_media_file(path).ok())
        .collect();

    // Assign unique IDs based on file path hash
    for file in media_files.iter_mut() {
        let mut hasher = DefaultHasher::new();
        file.file_path.hash(&mut hasher);
        file.id = (hasher.finish() & 0x7FFFFFFFFFFFFFFF) as i64; // Ensure positive i64
    }

    println!("Processed {} media files", media_files.len());

    Ok(media_files)
}

fn process_media_file(path: &Path) -> Result<MediaFile> {
    let file_path = path.to_string_lossy().to_string();
    let media_type = is_media_file(&file_path)
        .ok_or_else(|| anyhow::anyhow!("Not a media file"))?;

    // Get file metadata
    let metadata = std::fs::metadata(path)?;
    let file_size = metadata.len() as i64;
    let modified = metadata.modified()?;
    let modified_at = chrono::DateTime::<chrono::Utc>::from(modified);

    // Calculate file hash
    let file_hash = hash_file(path)?;

    // Get dimensions
    let (width, height) = match media_type {
        MediaType::Image => get_image_dimensions(path).unwrap_or((0, 0)),
        MediaType::Video => (0, 0), // TODO: Extract video dimensions
    };

    // Extract EXIF date
    let taken_at = if media_type == MediaType::Image {
        extract_date_taken(path)
    } else {
        None
    };

    let mut media = MediaFile::new(
        file_path,
        file_hash,
        file_size,
        width as i32,
        height as i32,
        media_type,
    );

    media.taken_at = taken_at;
    media.modified_at = modified_at;

    Ok(media)
}
