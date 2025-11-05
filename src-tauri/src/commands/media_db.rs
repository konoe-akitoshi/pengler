use crate::db::Database;
use crate::models::{MediaFile, MediaType};
use chrono::{DateTime, Utc};
use anyhow::Result;
use std::collections::HashMap;

#[tauri::command]
pub async fn save_media_files_to_db(files: Vec<MediaFile>) -> Result<(), String> {
    save_media_files_internal(files)
        .map_err(|e| format!("Failed to save media files: {}", e))
}

fn save_media_files_internal(files: Vec<MediaFile>) -> Result<()> {
    let db = Database::new()?;
    let file_count = files.len();

    // Get all registered library folders
    let library_folders = db.get_all_folders()?;

    // Build a map of folder_path -> folder_id
    let mut folder_map: HashMap<String, i64> = HashMap::new();
    for (path, _hash) in &library_folders {
        if let Some(folder_id) = db.get_folder_id(path)? {
            let mut normalized = path.replace("\\", "/").to_lowercase();
            // Ensure trailing slash for consistent matching
            if !normalized.ends_with('/') {
                normalized.push('/');
            }
            folder_map.insert(normalized, folder_id);
        }
    }

    let mut saved_count = 0;
    let mut error_count = 0;

    for file in &files {
        // Find which library folder this file belongs to
        let file_path_normalized = file.file_path.replace("\\", "/").to_lowercase();

        // Find the longest matching folder path (most specific)
        let folder_id_result = folder_map.iter()
            .filter(|(folder_path, _)| file_path_normalized.starts_with(folder_path.as_str()))
            .max_by_key(|(folder_path, _)| folder_path.len())
            .map(|(_, &id)| id);

        let folder_id = match folder_id_result {
            Some(id) => id,
            None => {
                eprintln!("Cannot find library folder for file: {}", file.file_path);
                error_count += 1;
                continue;
            }
        };

        let media_type_str = match file.media_type {
            MediaType::Image => "image",
            MediaType::Video => "video",
        };

        match db.upsert_media_file(
            folder_id,
            &file.file_path,
            &file.file_hash,
            file.file_size,
            file.width,
            file.height,
            file.taken_at.as_ref().map(|dt| dt.to_rfc3339()).as_deref(),
            &file.modified_at.to_rfc3339(),
            file.thumbnail_path.as_deref(),
            media_type_str,
            &file.created_at.to_rfc3339(),
        ) {
            Ok(_) => saved_count += 1,
            Err(e) => {
                eprintln!("Failed to save file {}: {}", file.file_path, e);
                error_count += 1;
            }
        }
    }

    if error_count > 0 {
        eprintln!("Saved {} of {} media files to database ({} errors)",
                  saved_count, file_count, error_count);
        return Err(anyhow::anyhow!("Failed to save {} files", error_count));
    }

    println!("Saved {} media files to database", saved_count);
    Ok(())
}

#[tauri::command]
pub async fn load_media_files_from_db() -> Result<Vec<MediaFile>, String> {
    load_media_files_internal()
        .map_err(|e| format!("Failed to load media files: {}", e))
}

fn load_media_files_internal() -> Result<Vec<MediaFile>> {
    let db = Database::new()?;

    let db_files = db.load_all_media_files()?;

    let files: Vec<MediaFile> = db_files
        .into_iter()
        .filter_map(|db_file| {
            let taken_at = db_file.taken_at.and_then(|s| {
                DateTime::parse_from_rfc3339(&s)
                    .ok()
                    .map(|dt| dt.with_timezone(&Utc))
            });

            let modified_at = DateTime::parse_from_rfc3339(&db_file.modified_at)
                .ok()?
                .with_timezone(&Utc);

            let created_at = DateTime::parse_from_rfc3339(&db_file.created_at)
                .ok()?
                .with_timezone(&Utc);

            let media_type = match db_file.media_type.as_str() {
                "image" => MediaType::Image,
                "video" => MediaType::Video,
                _ => return None,
            };

            Some(MediaFile {
                id: db_file.id,
                file_path: db_file.file_path,
                file_hash: db_file.file_hash,
                file_size: db_file.file_size,
                width: db_file.width,
                height: db_file.height,
                taken_at,
                modified_at,
                thumbnail_path: db_file.thumbnail_path,
                media_type,
                created_at,
            })
        })
        .collect();

    println!("Loaded {} media files from database", files.len());
    Ok(files)
}

#[tauri::command]
pub async fn delete_media_file_from_db(file_path: String) -> Result<(), String> {
    let db = Database::new()
        .map_err(|e| format!("Failed to open database: {}", e))?;

    db.delete_media_file_by_path(&file_path)
        .map_err(|e| format!("Failed to delete media file: {}", e))?;

    println!("Deleted media file from database: {}", file_path);
    Ok(())
}

#[tauri::command]
pub async fn get_media_files_count() -> Result<i64, String> {
    let db = Database::new()
        .map_err(|e| format!("Failed to open database: {}", e))?;

    db.get_media_files_count()
        .map_err(|e| format!("Failed to count: {}", e))
}
