use std::path::{Path, PathBuf};
use std::fs;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use chrono::{DateTime, Utc};
use tauri::{AppHandle, Emitter};

use crate::models::is_media_file;
use crate::utils::hash_file;
use crate::db::Database;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ImportCandidate {
    pub file_path: String,
    pub file_name: String,
    pub file_size: u64,
    pub file_hash: String,
    pub is_duplicate: bool,
    pub media_type: String,
    pub modified_at: String,
    pub thumbnail_path: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub checking_duplicate: Option<bool>,
}

#[tauri::command]
pub async fn scan_import_source(
    source_path: String,
    app: AppHandle,
) -> Result<(), String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() || !source.is_dir() {
        return Err("Invalid source path".to_string());
    }

    println!("Scanning import source: {}", source_path);

    // Spawn background task so we don't block the UI
    tauri::async_runtime::spawn(async move {
        // Collect all media files from source
        let entries: Vec<PathBuf> = WalkDir::new(&source)
            .follow_links(false)
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

        println!("Found {} media files in source", entries.len());

        // Emit total count
        let _ = app.emit("import-scan-total", entries.len());

        // Process files in parallel: preview generation + duplicate check
        use rayon::prelude::*;

        let results: Vec<_> = entries.par_iter().filter_map(|path| {
            // Create preview (with thumbnail)
            let mut preview = match create_preview_candidate(path) {
                Ok(p) => p,
                Err(e) => {
                    eprintln!("Failed to create preview for {}: {}", path.display(), e);
                    return None;
                }
            };

            preview.checking_duplicate = Some(true);

            // Emit preview immediately
            let _ = app.emit("import-scan-candidate", preview.clone());

            // Check for duplicates
            let db = match Database::new() {
                Ok(db) => db,
                Err(e) => {
                    eprintln!("Failed to open database: {}", e);
                    return None;
                }
            };

            let is_dup = check_duplicate(path, &preview, &db).unwrap_or(false);
            preview.is_duplicate = is_dup;
            preview.checking_duplicate = None;

            // Emit updated candidate with duplicate status
            let _ = app.emit("import-scan-candidate-update", preview.clone());

            Some((preview, is_dup))
        }).collect();

        let processed = results.len();
        let duplicates = results.iter().filter(|(_, is_dup)| *is_dup).count();

        println!("Processed {} candidates ({} duplicates)", processed, duplicates);

        // Emit completion event
        let _ = app.emit("import-scan-complete", ());
    });

    // Return immediately so UI doesn't block
    Ok(())
}

// Create preview candidate with basic info and thumbnail (fast)
fn create_preview_candidate(path: &Path) -> Result<ImportCandidate> {
    let file_name = path.file_name()
        .and_then(|n| n.to_str())
        .unwrap_or("unknown")
        .to_string();

    let metadata = fs::metadata(path)?;
    let file_size = metadata.len();

    let modified_at = metadata.modified()?
        .duration_since(std::time::UNIX_EPOCH)?
        .as_secs();
    let modified_at_str = chrono::DateTime::from_timestamp(modified_at as i64, 0)
        .unwrap_or_default()
        .format("%Y-%m-%d %H:%M:%S")
        .to_string();

    let media_type = is_media_file(path.to_str().unwrap_or(""))
        .map(|t| format!("{:?}", t).to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    // No thumbnail generation - use original file
    let thumbnail_path = None;

    Ok(ImportCandidate {
        file_path: path.to_string_lossy().to_string(),
        file_name,
        file_size,
        file_hash: String::new(), // Will be filled in check_duplicate
        is_duplicate: false, // Will be checked later
        media_type,
        modified_at: modified_at_str,
        thumbnail_path,
        checking_duplicate: None,
    })
}

// Check for duplicates (slower - requires hashing)
fn check_duplicate(path: &Path, _candidate: &ImportCandidate, db: &Database) -> Result<bool> {
    let file_hash = hash_file(path)?;
    let exists = db.check_file_exists(&file_hash)?;
    Ok(exists)
}

#[tauri::command]
pub async fn import_files(
    files: Vec<String>,
    destination_folder: String,
) -> Result<Vec<String>, String> {
    let dest_path = PathBuf::from(&destination_folder);
    if !dest_path.exists() {
        fs::create_dir_all(&dest_path)
            .map_err(|e| format!("Failed to create destination folder: {}", e))?;
    }

    println!("Importing {} files to {}", files.len(), destination_folder);

    // Get database connection for registering imported files
    let db = Database::new()
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Get or create library folder entry
    let folder_hash = crate::db::generate_folder_hash(&destination_folder);
    let folder_id = db.add_library_folder(&destination_folder, &folder_hash)
        .map_err(|e| format!("Failed to register library folder: {}", e))?;

    let mut imported_files = Vec::new();

    for source_file in files {
        let source = PathBuf::from(&source_file);
        if !source.exists() {
            eprintln!("Source file not found: {}", source_file);
            continue;
        }

        // Get file metadata to determine date
        let metadata = match fs::metadata(&source) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Failed to get metadata for {}: {}", source_file, e);
                continue;
            }
        };

        // Get modification date
        let modified_time = match metadata.modified() {
            Ok(t) => t,
            Err(e) => {
                eprintln!("Failed to get modification time for {}: {}", source_file, e);
                continue;
            }
        };

        // Convert to DateTime
        let datetime: DateTime<Utc> = modified_time.into();

        // Create folder structure: Year/YYYY-MM-DD
        let year = datetime.format("%Y").to_string();
        let date = datetime.format("%Y-%m-%d").to_string();

        let year_folder = dest_path.join(&year);
        let date_folder = year_folder.join(&date);

        // Create folders if they don't exist
        if let Err(e) = fs::create_dir_all(&date_folder) {
            eprintln!("Failed to create folder structure {}: {}", date_folder.display(), e);
            continue;
        }

        let file_name = source.file_name()
            .and_then(|n| n.to_str())
            .ok_or_else(|| "Invalid file name".to_string())?;

        let dest_file = date_folder.join(file_name);

        // Handle filename conflicts
        let final_dest = if dest_file.exists() {
            let mut counter = 1;
            let stem = source.file_stem()
                .and_then(|s| s.to_str())
                .unwrap_or("file");
            let ext = source.extension()
                .and_then(|e| e.to_str())
                .unwrap_or("");

            loop {
                let new_name = if ext.is_empty() {
                    format!("{}_{}", stem, counter)
                } else {
                    format!("{}_{}.{}", stem, counter, ext)
                };
                let new_path = date_folder.join(new_name);
                if !new_path.exists() {
                    break new_path;
                }
                counter += 1;
            }
        } else {
            dest_file
        };

        // Copy file
        match fs::copy(&source, &final_dest) {
            Ok(_) => {
                println!("Imported: {} -> {}", source_file, final_dest.display());

                // Calculate hash of the imported file and register it in database
                if let Ok(file_hash) = hash_file(&source) {
                    let file_metadata = fs::metadata(&final_dest).ok();
                    let file_size = file_metadata.as_ref().map(|m| m.len() as i64).unwrap_or(0);

                    let media_type = is_media_file(final_dest.to_str().unwrap_or(""))
                        .map(|t| format!("{:?}", t).to_lowercase())
                        .unwrap_or_else(|| "unknown".to_string());

                    // Register in database to track duplicates
                    if let Err(e) = db.add_cache_entry(
                        folder_id,
                        final_dest.to_str().unwrap_or(""),
                        &file_hash,
                        final_dest.to_str().unwrap_or(""),
                        &media_type,
                        file_size,
                        file_size,
                    ) {
                        eprintln!("Failed to register file in database: {}", e);
                    }
                }

                imported_files.push(final_dest.to_string_lossy().to_string());
            }
            Err(e) => {
                eprintln!("Failed to copy {}: {}", source_file, e);
            }
        }
    }

    println!("Successfully imported {} files", imported_files.len());

    Ok(imported_files)
}

#[tauri::command]
pub async fn rescan_library_folder(folder_path: String) -> Result<usize, String> {
    println!("Rescanning library folder: {}", folder_path);

    let folder = PathBuf::from(&folder_path);
    if !folder.exists() || !folder.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    // Get database connection
    let db = Database::new()
        .map_err(|e| format!("Failed to open database: {}", e))?;

    // Get or create library folder entry
    let folder_hash = crate::db::generate_folder_hash(&folder_path);
    let folder_id = db.add_library_folder(&folder_path, &folder_hash)
        .map_err(|e| format!("Failed to register library folder: {}", e))?;

    // Collect all media files from folder
    let entries: Vec<PathBuf> = WalkDir::new(&folder)
        .follow_links(false)
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

    println!("Found {} media files in library folder", entries.len());

    // Get all files in database for this folder
    let db_files = db.load_all_media_files()
        .map_err(|e| format!("Failed to load database files: {}", e))?;

    // Build set of existing file paths
    let existing_paths: std::collections::HashSet<String> = entries
        .iter()
        .filter_map(|p| p.to_str().map(|s| s.to_lowercase()))
        .collect();

    // Delete files from database that no longer exist on disk
    let mut deleted = 0;
    for db_file in db_files {
        let db_path_normalized = db_file.file_path.to_lowercase();
        if db_path_normalized.starts_with(&folder_path.to_lowercase()) &&
           !existing_paths.contains(&db_path_normalized) {
            if let Err(e) = db.delete_media_file_by_path(&db_file.file_path) {
                eprintln!("Failed to delete {} from database: {}", db_file.file_path, e);
            } else {
                println!("Deleted missing file from database: {}", db_file.file_path);
                deleted += 1;
            }
        }
    }

    if deleted > 0 {
        println!("Deleted {} missing files from database", deleted);
    }

    let mut registered = 0;

    // Process each file
    for path in entries {
        // Calculate hash
        let file_hash = match hash_file(&path) {
            Ok(h) => h,
            Err(e) => {
                eprintln!("Failed to hash {}: {}", path.display(), e);
                continue;
            }
        };

        // Check if already registered
        if db.check_file_exists(&file_hash).unwrap_or(false) {
            continue; // Already in database
        }

        // Get file metadata
        let metadata = match fs::metadata(&path) {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Failed to get metadata for {}: {}", path.display(), e);
                continue;
            }
        };

        let file_size = metadata.len() as i64;

        let media_type = is_media_file(path.to_str().unwrap_or(""))
            .map(|t| format!("{:?}", t).to_lowercase())
            .unwrap_or_else(|| "unknown".to_string());

        // Register in database
        if let Err(e) = db.add_cache_entry(
            folder_id,
            path.to_str().unwrap_or(""),
            &file_hash,
            path.to_str().unwrap_or(""),
            &media_type,
            file_size,
            file_size,
        ) {
            eprintln!("Failed to register {} in database: {}", path.display(), e);
        } else {
            println!("Registered: {} ({})", path.display(), file_hash);
            registered += 1;
        }
    }

    println!("Registered {} new files in database", registered);
    Ok(registered)
}

#[tauri::command]
pub async fn debug_database_entries() -> Result<String, String> {
    let db = Database::new()
        .map_err(|e| format!("Failed to open database: {}", e))?;

    let total = db.get_total_entry_count()
        .map_err(|e| format!("Failed to get count: {}", e))?;

    let entries = db.get_all_cache_entries()
        .map_err(|e| format!("Failed to get entries: {}", e))?;

    let mut output = format!("Total entries in database: {}\n\n", total);
    output.push_str("Recent entries (up to 100):\n");
    output.push_str("-".repeat(80).as_str());
    output.push_str("\n");

    for (hash, path, media_type) in entries {
        let exists = std::path::Path::new(&path).exists();
        output.push_str(&format!(
            "Hash: {}\nPath: {}\nType: {}\nExists: {}\n\n",
            &hash[..16],  // Show first 16 chars of hash
            path,
            media_type,
            exists
        ));
    }

    Ok(output)
}

#[tauri::command]
pub async fn detect_removable_drives() -> Result<Vec<String>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // On Windows, check for removable drives
        for drive_letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", drive_letter as char);
            let path = PathBuf::from(&drive);
            if path.exists() {
                // Check if it's a removable drive by checking for DCIM folder
                // (common in cameras and SD cards)
                let dcim_path = path.join("DCIM");
                if dcim_path.exists() {
                    drives.push(drive);
                }
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // On macOS, check /Volumes
        let volumes_path = PathBuf::from("/Volumes");
        if volumes_path.exists() {
            if let Ok(entries) = fs::read_dir(volumes_path) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();
                    // Check for DCIM folder
                    let dcim_path = path.join("DCIM");
                    if dcim_path.exists() {
                        if let Some(path_str) = path.to_str() {
                            drives.push(path_str.to_string());
                        }
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // On Linux, check /media and /mnt
        for base_path in ["/media", "/mnt"] {
            let base = PathBuf::from(base_path);
            if base.exists() {
                if let Ok(entries) = fs::read_dir(base) {
                    for entry in entries.filter_map(|e| e.ok()) {
                        let path = entry.path();
                        if path.is_dir() {
                            // Check for DCIM folder
                            let dcim_path = path.join("DCIM");
                            if dcim_path.exists() {
                                if let Some(path_str) = path.to_str() {
                                    drives.push(path_str.to_string());
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(drives)
}
