use std::path::{Path, PathBuf};
use std::fs;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use walkdir::WalkDir;
use chrono::{DateTime, Utc};

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
}

#[tauri::command]
pub async fn scan_import_source(source_path: String) -> Result<Vec<ImportCandidate>, String> {
    let source = PathBuf::from(&source_path);
    if !source.exists() || !source.is_dir() {
        return Err("Invalid source path".to_string());
    }

    println!("Scanning import source: {}", source_path);

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

    // Get database to check for duplicates
    let db = Database::new().map_err(|e| format!("Failed to open database: {}", e))?;

    // Process each file
    let mut candidates = Vec::new();
    for path in entries {
        match process_import_candidate(&path, &db) {
            Ok(candidate) => candidates.push(candidate),
            Err(e) => {
                eprintln!("Failed to process {}: {}", path.display(), e);
            }
        }
    }

    println!("Processed {} candidates ({} duplicates)",
        candidates.len(),
        candidates.iter().filter(|c| c.is_duplicate).count()
    );

    Ok(candidates)
}

fn process_import_candidate(path: &Path, db: &Database) -> Result<ImportCandidate> {
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

    // Calculate file hash
    let file_hash = hash_file(path)?;

    // Check if this hash already exists in database
    let is_duplicate = db.check_file_exists(&file_hash)
        .unwrap_or(false);

    // Determine media type
    let media_type = is_media_file(path.to_str().unwrap_or(""))
        .map(|t| format!("{:?}", t).to_lowercase())
        .unwrap_or_else(|| "unknown".to_string());

    Ok(ImportCandidate {
        file_path: path.to_string_lossy().to_string(),
        file_name,
        file_size,
        file_hash,
        is_duplicate,
        media_type,
        modified_at: modified_at_str,
    })
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
                        file_size, // Same size since we're not creating thumbnails here
                    ) {
                        eprintln!("Failed to register file in database: {}", e);
                    } else {
                        println!("Registered in database: {}", file_hash);
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
