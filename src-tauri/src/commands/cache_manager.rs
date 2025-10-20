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
    let db = Database::new().map_err(|e| e.to_string())?;

    // Get all cached file paths for this folder
    let cached_paths = db.remove_library_folder(&folder_path)
        .map_err(|e| e.to_string())?;

    // Delete all cached files
    for cached_path in cached_paths {
        if let Err(e) = fs::remove_file(&cached_path) {
            eprintln!("Failed to delete cached file {}: {}", cached_path, e);
        }
    }

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
pub async fn cleanup_orphaned_cache() -> Result<u64, String> {
    let db = Database::new().map_err(|e| e.to_string())?;
    let mut cleaned_count = 0u64;

    // Get all cache entries
    let folders = db.get_all_folders().map_err(|e| e.to_string())?;

    for (folder_path, _) in folders {
        // Check if folder still exists
        if !Path::new(&folder_path).exists() {
            // Remove the folder and its cache
            let cached_paths = db.remove_library_folder(&folder_path)
                .map_err(|e| e.to_string())?;

            for cached_path in cached_paths {
                if fs::remove_file(&cached_path).is_ok() {
                    cleaned_count += 1;
                }
            }
        }
    }

    Ok(cleaned_count)
}
