use std::path::PathBuf;
use rusqlite::{Connection, params};
use anyhow::Result;

use crate::models::MediaFile;
use crate::commands::thumbnail::get_cache_directory;

pub fn get_db_path() -> Result<PathBuf> {
    let cache_dir = get_cache_directory()?;
    Ok(cache_dir.join("pengler.db"))
}

pub fn init_database() -> Result<Connection> {
    let db_path = get_db_path()?;

    // Ensure directory exists
    if let Some(parent) = db_path.parent() {
        std::fs::create_dir_all(parent)?;
    }

    let conn = Connection::open(db_path)?;

    conn.execute(
        "CREATE TABLE IF NOT EXISTS media_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            file_path TEXT UNIQUE NOT NULL,
            file_hash TEXT NOT NULL,
            file_size INTEGER,
            width INTEGER,
            height INTEGER,
            taken_at TEXT,
            modified_at TEXT,
            thumbnail_path TEXT,
            media_type TEXT,
            created_at TEXT DEFAULT CURRENT_TIMESTAMP
        )",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_taken_at ON media_files(taken_at)",
        [],
    )?;

    conn.execute(
        "CREATE INDEX IF NOT EXISTS idx_file_hash ON media_files(file_hash)",
        [],
    )?;

    Ok(conn)
}

#[tauri::command]
pub async fn save_media_files(files: Vec<MediaFile>) -> Result<(), String> {
    save_media_files_internal(files)
        .map_err(|e| format!("Failed to save media files: {}", e))
}

fn save_media_files_internal(files: Vec<MediaFile>) -> Result<()> {
    let conn = init_database()?;

    for file in files {
        conn.execute(
            "INSERT OR REPLACE INTO media_files
            (file_path, file_hash, file_size, width, height, taken_at, modified_at, thumbnail_path, media_type)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                file.file_path,
                file.file_hash,
                file.file_size,
                file.width,
                file.height,
                file.taken_at.map(|dt| dt.to_rfc3339()),
                file.modified_at.to_rfc3339(),
                file.thumbnail_path,
                serde_json::to_string(&file.media_type).unwrap(),
            ],
        )?;
    }

    Ok(())
}

#[tauri::command]
pub async fn load_media_files() -> Result<Vec<MediaFile>, String> {
    load_media_files_internal()
        .map_err(|e| format!("Failed to load media files: {}", e))
}

fn load_media_files_internal() -> Result<Vec<MediaFile>> {
    let conn = init_database()?;

    let mut stmt = conn.prepare(
        "SELECT id, file_path, file_hash, file_size, width, height,
         taken_at, modified_at, thumbnail_path, media_type, created_at
         FROM media_files
         ORDER BY taken_at DESC, modified_at DESC"
    )?;

    let files = stmt.query_map([], |row| {
        let taken_at_str: Option<String> = row.get(6)?;
        let taken_at = taken_at_str.and_then(|s| chrono::DateTime::parse_from_rfc3339(&s).ok())
            .map(|dt| dt.with_timezone(&chrono::Utc));

        let modified_at_str: String = row.get(7)?;
        let modified_at = chrono::DateTime::parse_from_rfc3339(&modified_at_str)
            .unwrap()
            .with_timezone(&chrono::Utc);

        let created_at_str: String = row.get(10)?;
        let created_at = chrono::DateTime::parse_from_rfc3339(&created_at_str)
            .unwrap()
            .with_timezone(&chrono::Utc);

        let media_type_str: String = row.get(9)?;
        let media_type: crate::models::MediaType = serde_json::from_str(&media_type_str).unwrap();

        Ok(MediaFile {
            id: row.get(0)?,
            file_path: row.get(1)?,
            file_hash: row.get(2)?,
            file_size: row.get(3)?,
            width: row.get(4)?,
            height: row.get(5)?,
            taken_at,
            modified_at,
            thumbnail_path: row.get(8)?,
            media_type,
            created_at,
        })
    })?;

    let mut result = Vec::new();
    for file in files {
        result.push(file?);
    }

    Ok(result)
}
