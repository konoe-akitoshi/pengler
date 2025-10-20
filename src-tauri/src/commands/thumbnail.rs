use std::path::{Path, PathBuf};
use std::fs;
use std::process::Command;
use image::{imageops::FilterType, ImageFormat};
use anyhow::Result;

use crate::utils::short_hash;
use crate::models::{MediaType, is_media_file};

const THUMBNAIL_SIZE: u32 = 300;

#[tauri::command]
pub async fn generate_thumbnail(
    file_path: String,
    file_hash: String,
) -> Result<String, String> {
    generate_thumbnail_internal(&file_path, &file_hash)
        .map_err(|e| format!("Failed to generate thumbnail: {}", e))
}

fn generate_thumbnail_internal(file_path: &str, file_hash: &str) -> Result<String> {
    let source_path = Path::new(file_path);

    // Get cache directory
    let cache_dir = get_cache_directory()?;
    let thumbnail_dir = cache_dir.join("thumbnails");
    fs::create_dir_all(&thumbnail_dir)?;

    // Generate thumbnail filename
    let short_name = short_hash(file_hash);
    let thumbnail_path = thumbnail_dir.join(format!("{}.webp", short_name));

    // Check if thumbnail already exists
    if thumbnail_path.exists() {
        return Ok(thumbnail_path.to_string_lossy().to_string());
    }

    // Determine media type
    let media_type = is_media_file(file_path)
        .ok_or_else(|| anyhow::anyhow!("Not a supported media file"))?;

    match media_type {
        MediaType::Image => generate_image_thumbnail(source_path, &thumbnail_path)?,
        MediaType::Video => generate_video_thumbnail(source_path, &thumbnail_path)?,
    }

    Ok(thumbnail_path.to_string_lossy().to_string())
}

fn generate_image_thumbnail(source_path: &Path, thumbnail_path: &Path) -> Result<()> {
    // Open and resize image
    let img = image::open(source_path)?;
    let thumbnail = img.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, FilterType::Lanczos3);

    // Save as WebP
    thumbnail.save_with_format(thumbnail_path, ImageFormat::WebP)?;

    Ok(())
}

fn generate_video_thumbnail(source_path: &Path, thumbnail_path: &Path) -> Result<()> {
    // Create a temporary PNG file first
    let temp_png = thumbnail_path.with_extension("png");

    // Try to use ffmpeg to extract frame at 1 second
    let output = Command::new("ffmpeg")
        .arg("-ss").arg("1") // Seek to 1 second
        .arg("-i").arg(source_path)
        .arg("-vframes").arg("1") // Extract one frame
        .arg("-vf").arg(format!("scale={}:{}:force_original_aspect_ratio=decrease", THUMBNAIL_SIZE, THUMBNAIL_SIZE))
        .arg("-y") // Overwrite output file
        .arg(&temp_png)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            // Convert PNG to WebP using image crate
            let img = image::open(&temp_png)?;
            let thumbnail = img.resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, FilterType::Lanczos3);
            thumbnail.save_with_format(thumbnail_path, ImageFormat::WebP)?;

            // Clean up temporary PNG
            let _ = fs::remove_file(&temp_png);

            Ok(())
        },
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            Err(anyhow::anyhow!("ffmpeg failed: {}", stderr))
        },
        Err(e) => {
            // If ffmpeg is not installed, return a more helpful error
            if e.kind() == std::io::ErrorKind::NotFound {
                Err(anyhow::anyhow!("ffmpeg not found. Please install ffmpeg to generate video thumbnails."))
            } else {
                Err(anyhow::anyhow!("Failed to run ffmpeg: {}", e))
            }
        }
    }
}

pub fn get_cache_directory() -> Result<PathBuf> {
    let home = dirs::home_dir().ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    let cache_dir = home.join(".pengler").join("cache");
    Ok(cache_dir)
}

#[tauri::command]
pub async fn get_cache_stats() -> Result<CacheStats, String> {
    get_cache_stats_internal()
        .map_err(|e| format!("Failed to get cache stats: {}", e))
}

#[derive(serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct CacheStats {
    pub total_size: u64,
    pub file_count: usize,
    pub max_size: u64,
}

fn get_cache_stats_internal() -> Result<CacheStats> {
    let cache_dir = get_cache_directory()?;
    let thumbnail_dir = cache_dir.join("thumbnails");

    if !thumbnail_dir.exists() {
        return Ok(CacheStats {
            total_size: 0,
            file_count: 0,
            max_size: 500 * 1024 * 1024, // 500MB
        });
    }

    let mut total_size = 0u64;
    let mut file_count = 0usize;

    for entry in fs::read_dir(&thumbnail_dir)? {
        if let Ok(entry) = entry {
            if let Ok(metadata) = entry.metadata() {
                if metadata.is_file() {
                    total_size += metadata.len();
                    file_count += 1;
                }
            }
        }
    }

    Ok(CacheStats {
        total_size,
        file_count,
        max_size: 500 * 1024 * 1024,
    })
}

#[tauri::command]
pub async fn clear_cache() -> Result<(), String> {
    clear_cache_internal()
        .map_err(|e| format!("Failed to clear cache: {}", e))
}

fn clear_cache_internal() -> Result<()> {
    let cache_dir = get_cache_directory()?;
    let thumbnail_dir = cache_dir.join("thumbnails");

    if thumbnail_dir.exists() {
        fs::remove_dir_all(&thumbnail_dir)?;
        fs::create_dir_all(&thumbnail_dir)?;
    }

    Ok(())
}
