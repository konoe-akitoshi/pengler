use std::path::{Path, PathBuf};
use std::process::Command;
use std::fs;
use image::{imageops::FilterType, DynamicImage};
use anyhow::Result;

use crate::config::Config;
use crate::db::Database;
use crate::utils::short_hash;

/// Optimize an image file
pub fn optimize_image(
    source_path: &Path,
    output_dir: &Path,
    file_hash: &str,
    quality: u8,
    max_resolution: u32,
) -> Result<(PathBuf, i64)> {
    // Open the image
    let img = image::open(source_path)?;

    // Resize if necessary
    let optimized = if img.width() > max_resolution || img.height() > max_resolution {
        img.resize(max_resolution, max_resolution, FilterType::Lanczos3)
    } else {
        img
    };

    // Generate output path
    let short_name = short_hash(file_hash);
    let output_path = output_dir.join(format!("{}.webp", short_name));

    // Save as WebP with quality setting
    save_webp(&optimized, &output_path, quality)?;

    // Get file size
    let metadata = fs::metadata(&output_path)?;
    let file_size = metadata.len() as i64;

    Ok((output_path, file_size))
}

fn save_webp(img: &DynamicImage, path: &Path, _quality: u8) -> Result<()> {
    // For now, use the image crate's WebP support
    // In the future, we could use libwebp directly for better control
    let encoder = image::codecs::webp::WebPEncoder::new_lossless(
        fs::File::create(path)?
    );

    // Note: The image crate doesn't support quality in WebP yet,
    // so we're using lossless for now. For lossy with quality control,
    // we'd need to use the webp crate directly.
    img.write_with_encoder(encoder)?;

    Ok(())
}

/// Optimize a video file using ffmpeg
pub fn optimize_video(
    source_path: &Path,
    output_dir: &Path,
    file_hash: &str,
    max_resolution: u32,
) -> Result<(PathBuf, i64)> {
    // Generate output path
    let short_name = short_hash(file_hash);
    let output_path = output_dir.join(format!("{}.mp4", short_name));

    // Calculate target resolution (maintain aspect ratio) and ensure dimensions are divisible by 2
    let scale_filter = format!(
        "scale='min({},iw)':'min({},ih)':force_original_aspect_ratio=decrease,scale=trunc(iw/2)*2:trunc(ih/2)*2",
        max_resolution, max_resolution
    );

    // Run ffmpeg to optimize the video
    let output = Command::new("ffmpeg")
        .arg("-i").arg(source_path)
        .arg("-vf").arg(scale_filter)
        .arg("-c:v").arg("libx264")  // H.264 codec
        .arg("-preset").arg("medium")  // Encoding speed preset
        .arg("-crf").arg("23")  // Quality (lower = better, 23 is default)
        .arg("-c:a").arg("aac")  // AAC audio codec
        .arg("-b:a").arg("128k")  // Audio bitrate
        .arg("-movflags").arg("+faststart")  // Enable streaming
        .arg("-y")  // Overwrite output file
        .arg(&output_path)
        .output();

    match output {
        Ok(result) if result.status.success() => {
            // Get file size
            let metadata = fs::metadata(&output_path)?;
            let file_size = metadata.len() as i64;

            Ok((output_path, file_size))
        },
        Ok(result) => {
            let stderr = String::from_utf8_lossy(&result.stderr);
            Err(anyhow::anyhow!("ffmpeg failed: {}", stderr))
        },
        Err(e) => {
            if e.kind() == std::io::ErrorKind::NotFound {
                Err(anyhow::anyhow!("ffmpeg not found. Please install ffmpeg to optimize videos."))
            } else {
                Err(anyhow::anyhow!("Failed to run ffmpeg: {}", e))
            }
        }
    }
}

#[tauri::command]
pub async fn optimize_media_file(
    folder_path: String,
    file_path: String,
    file_hash: String,
    media_type: String,
) -> Result<String, String> {
    use crate::task_manager::TASK_MANAGER;

    match optimize_media_file_internal(&folder_path, &file_path, &file_hash, &media_type).await {
        Ok(result) => Ok(result),
        Err(e) => {
            // Update task with failure (unless it was already counted during stop)
            if let Some(task) = TASK_MANAGER.get_task(&folder_path) {
                if !task.is_stopped() {
                    task.increment_failed();
                }
            }
            Err(e.to_string())
        }
    }
}

async fn optimize_media_file_internal(
    folder_path: &str,
    file_path: &str,
    file_hash: &str,
    media_type: &str,
) -> Result<String> {
    use crate::task_manager::TASK_MANAGER;

    println!("Optimizing file: {}", file_path);
    println!("Library folder: {}", folder_path);

    // Load configuration
    let config = Config::load()?;

    // Check if the library folder still exists in config
    // This prevents orphaned cache creation if folder was removed during optimization
    if !config.library_folders.contains(&folder_path.to_string()) {
        println!("Folder no longer in library, skipping optimization: {}", folder_path);
        return Err(anyhow::anyhow!("Library folder has been removed: {}", folder_path));
    }

    // Check if there's a task for this folder and if it's paused or stopped
    if let Some(task) = TASK_MANAGER.get_task(folder_path) {
        // Wait while paused
        while task.is_paused() && !task.is_stopped() {
            println!("Task paused, waiting...");
            std::thread::sleep(std::time::Duration::from_millis(500));
        }

        // Stop if requested
        if task.is_stopped() {
            task.increment_processed();
            task.increment_failed();
            println!("Task stopped, skipping optimization: {}", file_path);
            return Err(anyhow::anyhow!("Optimization task was stopped"));
        }
    }

    // Get cache directory
    let cache_dir = PathBuf::from(&config.cache_folder);
    let optimized_dir = cache_dir.join("optimized");
    fs::create_dir_all(&optimized_dir)?;

    // Check if already optimized
    let db = Database::new()?;
    if let Some(cached_path) = db.get_cached_path(file_hash)? {
        if Path::new(&cached_path).exists() {
            println!("File already optimized: {}", cached_path);
            // Update task counters for already cached files
            if let Some(task) = TASK_MANAGER.get_task(folder_path) {
                task.increment_processed();
                task.increment_optimized();

                // Check if task is complete
                let info = task.get_info();
                if info.processed_files >= info.total_files {
                    task.complete();
                    println!("Task completed for folder: {}", folder_path);
                }
            }
            return Ok(cached_path);
        }
    }

    // Increment processed counter now that we're actually processing
    if let Some(task) = TASK_MANAGER.get_task(folder_path) {
        task.increment_processed();
    }

    // Optimize based on media type
    let source_path = Path::new(file_path);
    let (output_path, cached_size) = match media_type {
        "image" => optimize_image(
            source_path,
            &optimized_dir,
            file_hash,
            config.optimization_quality,
            config.max_resolution,
        )?,
        "video" => optimize_video(
            source_path,
            &optimized_dir,
            file_hash,
            config.max_resolution,
        )?,
        _ => return Err(anyhow::anyhow!("Unsupported media type: {}", media_type)),
    };

    println!("Optimized to: {}", output_path.display());

    // Register in database
    // Only use existing folder_id - do not create new ones during optimization
    let folder_id = match db.get_folder_id(folder_path)? {
        Some(id) => {
            println!("Found existing folder_id: {}", id);
            id
        }
        None => {
            println!("Folder not found in DB, cannot register cache without library folder");
            return Err(anyhow::anyhow!("Library folder not registered in database: {}", folder_path));
        }
    };

    let file_metadata = fs::metadata(source_path)?;
    let original_size = file_metadata.len() as i64;

    println!("Adding cache entry: folder_id={}, file={}, hash={}", folder_id, file_path, file_hash);

    db.add_cache_entry(
        folder_id,
        file_path,
        file_hash,
        &output_path.to_string_lossy(),
        media_type,
        original_size,
        cached_size,
    )?;

    println!("Cache entry added successfully");

    // Update task with success
    if let Some(task) = TASK_MANAGER.get_task(folder_path) {
        task.increment_optimized();

        // Check if task is complete
        let info = task.get_info();
        if info.processed_files >= info.total_files {
            task.complete();
            println!("Task completed for folder: {}", folder_path);
        }
    }

    Ok(output_path.to_string_lossy().to_string())
}

#[tauri::command]
pub async fn batch_optimize_folder(
    folder_path: String,
) -> Result<BatchOptimizeProgress, String> {
    batch_optimize_folder_internal(&folder_path)
        .await
        .map_err(|e| e.to_string())
}

async fn batch_optimize_folder_internal(folder_path: &str) -> Result<BatchOptimizeProgress> {
    use crate::models::is_media_file;
    use walkdir::WalkDir;

    let mut progress = BatchOptimizeProgress {
        total: 0,
        processed: 0,
        optimized: 0,
        cached: 0,
        failed: 0,
    };

    // Count total media files
    let entries: Vec<PathBuf> = WalkDir::new(folder_path)
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

    progress.total = entries.len();

    // Process each file
    for path in entries {
        progress.processed += 1;

        let file_path = path.to_string_lossy().to_string();
        let media_type = is_media_file(&file_path)
            .map(|t| format!("{:?}", t).to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        // Calculate file hash
        use crate::utils::hash_file;
        let file_hash = match hash_file(&path) {
            Ok(hash) => hash,
            Err(_) => {
                progress.failed += 1;
                continue;
            }
        };

        // Try to optimize
        match optimize_media_file_internal(folder_path, &file_path, &file_hash, &media_type).await {
            Ok(_) => progress.optimized += 1,
            Err(_) => progress.failed += 1,
        }
    }

    Ok(progress)
}

#[derive(serde::Serialize)]
pub struct BatchOptimizeProgress {
    pub total: usize,
    pub processed: usize,
    pub optimized: usize,
    pub cached: usize,
    pub failed: usize,
}
