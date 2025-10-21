use std::fs;
use std::path::Path;
use anyhow::Result;
use crate::db::{Database, generate_folder_hash, CacheStats};

#[tauri::command]
pub async fn register_library_folder(folder_path: String) -> Result<(), String> {
    let db = Database::new().map_err(|e| e.to_string())?;
    let folder_hash = generate_folder_hash(&folder_path);

    db.add_library_folder(&folder_path, &folder_hash)
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn unregister_library_folder(folder_path: String) -> Result<(), String> {
    use crate::utils::short_hash;

    println!("Unregistering library folder: {}", folder_path);

    let db = Database::new().map_err(|e| e.to_string())?;

    // Get all cached file paths and thumbnail hashes for this folder
    let (cached_paths, thumbnail_hashes) = db.remove_library_folder(&folder_path)
        .map_err(|e| e.to_string())?;

    println!("Found {} cached files and {} thumbnails to delete", cached_paths.len(), thumbnail_hashes.len());

    // Get cache folder from config
    let config = crate::config::Config::load().map_err(|e| e.to_string())?;
    let cache_dir = std::path::PathBuf::from(&config.cache_folder);
    let thumbnails_dir = cache_dir.join("thumbnails");
    let optimized_dir = cache_dir.join("optimized");

    println!("Cache dir: {}", cache_dir.display());
    println!("Thumbnails dir: {}", thumbnails_dir.display());
    println!("Optimized dir: {}", optimized_dir.display());

    // Delete all cached files
    let mut deleted_cached = 0;
    for cached_path in &cached_paths {
        println!("Attempting to delete cached file: {}", cached_path);
        match fs::remove_file(cached_path) {
            Ok(_) => {
                println!("✓ Deleted: {}", cached_path);
                deleted_cached += 1;
            }
            Err(e) => {
                eprintln!("✗ Failed to delete cached file {}: {}", cached_path, e);
            }
        }
    }

    // Delete all thumbnail files
    let mut deleted_thumbnails = 0;
    for file_hash in &thumbnail_hashes {
        let short_name = short_hash(file_hash);
        let thumbnail_path = thumbnails_dir.join(format!("{}.webp", short_name));
        println!("Attempting to delete thumbnail: {}", thumbnail_path.display());

        if thumbnail_path.exists() {
            match fs::remove_file(&thumbnail_path) {
                Ok(_) => {
                    println!("✓ Deleted thumbnail: {}", thumbnail_path.display());
                    deleted_thumbnails += 1;
                }
                Err(e) => {
                    eprintln!("✗ Failed to delete thumbnail {}: {}", thumbnail_path.display(), e);
                }
            }
        } else {
            println!("✗ Thumbnail not found: {}", thumbnail_path.display());
        }
    }

    println!("Deletion complete: {} cached files, {} thumbnails", deleted_cached, deleted_thumbnails);

    Ok(())
}

#[tauri::command]
pub async fn get_library_folders() -> Result<Vec<String>, String> {
    let db = Database::new().map_err(|e| e.to_string())?;
    let folders = db.get_all_folders()
        .map_err(|e| e.to_string())?;

    Ok(folders.into_iter().map(|(path, _)| path).collect())
}

#[tauri::command]
pub async fn get_cached_file_path(file_hash: String) -> Result<Option<String>, String> {
    let db = Database::new().map_err(|e| e.to_string())?;

    db.get_cached_path(&file_hash)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn register_cache_entry(
    folder_path: String,
    original_path: String,
    file_hash: String,
    cached_path: String,
    media_type: String,
    file_size: i64,
    cached_size: i64,
) -> Result<(), String> {
    let db = Database::new().map_err(|e| e.to_string())?;

    // Get or create folder ID
    let folder_id = match db.get_folder_id(&folder_path).map_err(|e| e.to_string())? {
        Some(id) => id,
        None => {
            let folder_hash = generate_folder_hash(&folder_path);
            db.add_library_folder(&folder_path, &folder_hash)
                .map_err(|e| e.to_string())?
        }
    };

    db.add_cache_entry(
        folder_id,
        &original_path,
        &file_hash,
        &cached_path,
        &media_type,
        file_size,
        cached_size,
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_database_cache_stats() -> Result<CacheStats, String> {
    let db = Database::new().map_err(|e| e.to_string())?;
    db.get_cache_stats().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn clear_folder_cache(folder_path: String) -> Result<(), String> {
    use crate::utils::short_hash;

    println!("Clearing cache for folder: {}", folder_path);

    let db = Database::new().map_err(|e| e.to_string())?;

    // Get all cached file paths and thumbnail hashes for this folder
    let (cached_paths, thumbnail_hashes) = db.clear_folder_cache(&folder_path)
        .map_err(|e| e.to_string())?;

    println!("Found {} cached files and {} thumbnails to delete", cached_paths.len(), thumbnail_hashes.len());

    // Get cache folder from config
    let config = crate::config::Config::load().map_err(|e| e.to_string())?;
    let cache_dir = std::path::PathBuf::from(&config.cache_folder);
    let thumbnails_dir = cache_dir.join("thumbnails");

    // Delete all cached files
    let mut deleted_cached = 0;
    for cached_path in &cached_paths {
        println!("Attempting to delete cached file: {}", cached_path);
        match fs::remove_file(cached_path) {
            Ok(_) => {
                println!("✓ Deleted: {}", cached_path);
                deleted_cached += 1;
            }
            Err(e) => {
                eprintln!("✗ Failed to delete cached file {}: {}", cached_path, e);
            }
        }
    }

    // Delete all thumbnail files
    let mut deleted_thumbnails = 0;
    for file_hash in &thumbnail_hashes {
        let short_name = short_hash(file_hash);
        let thumbnail_path = thumbnails_dir.join(format!("{}.webp", short_name));
        println!("Attempting to delete thumbnail: {}", thumbnail_path.display());

        if thumbnail_path.exists() {
            match fs::remove_file(&thumbnail_path) {
                Ok(_) => {
                    println!("✓ Deleted thumbnail: {}", thumbnail_path.display());
                    deleted_thumbnails += 1;
                }
                Err(e) => {
                    eprintln!("✗ Failed to delete thumbnail {}: {}", thumbnail_path.display(), e);
                }
            }
        }
    }

    println!("Cache cleared: {} cached files, {} thumbnails", deleted_cached, deleted_thumbnails);

    Ok(())
}

#[tauri::command]
pub async fn cleanup_orphaned_cache() -> Result<u64, String> {
    use crate::utils::short_hash;

    let db = Database::new().map_err(|e| e.to_string())?;
    let mut cleaned_count = 0u64;

    // Get cache folder from config
    let config = crate::config::Config::load().map_err(|e| e.to_string())?;
    let cache_dir = std::path::PathBuf::from(&config.cache_folder);
    let thumbnails_dir = cache_dir.join("thumbnails");

    // Get all cache entries
    let folders = db.get_all_folders().map_err(|e| e.to_string())?;

    for (folder_path, _) in folders {
        // Check if folder still exists
        if !Path::new(&folder_path).exists() {
            // Remove the folder and its cache
            let (cached_paths, thumbnail_hashes) = db.remove_library_folder(&folder_path)
                .map_err(|e| e.to_string())?;

            // Delete cached files
            for cached_path in cached_paths {
                if fs::remove_file(&cached_path).is_ok() {
                    cleaned_count += 1;
                }
            }

            // Delete thumbnail files
            for file_hash in thumbnail_hashes {
                let short_name = short_hash(&file_hash);
                let thumbnail_path = thumbnails_dir.join(format!("{}.webp", short_name));
                if thumbnail_path.exists() && fs::remove_file(&thumbnail_path).is_ok() {
                    cleaned_count += 1;
                }
            }
        }
    }

    Ok(cleaned_count)
}
