use rusqlite::{Connection, Result as SqlResult, OptionalExtension};
use std::path::PathBuf;
use anyhow::Result;

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new() -> Result<Self> {
        let db_path = get_db_path()?;

        // Create parent directory if it doesn't exist
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent)?;
        }

        let conn = Connection::open(&db_path)?;

        let db = Database { conn };
        db.init_schema()?;

        Ok(db)
    }

    fn init_schema(&self) -> Result<()> {
        // Library folders table
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS library_folders (
                id INTEGER PRIMARY KEY,
                path TEXT NOT NULL UNIQUE,
                folder_hash TEXT NOT NULL UNIQUE,
                added_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                last_scanned DATETIME,
                total_files INTEGER DEFAULT 0
            )",
            [],
        )?;

        // Cache entries table - tracks individual cached files
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS cache_entries (
                id INTEGER PRIMARY KEY,
                folder_id INTEGER NOT NULL,
                original_path TEXT NOT NULL,
                file_hash TEXT NOT NULL,
                cached_path TEXT NOT NULL,
                media_type TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                cached_size INTEGER NOT NULL,
                created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE,
                UNIQUE(folder_id, file_hash)
            )",
            [],
        )?;

        // Media files table - stores MediaFile information for quick loading
        self.conn.execute(
            "CREATE TABLE IF NOT EXISTS media_files (
                id INTEGER PRIMARY KEY,
                folder_id INTEGER NOT NULL,
                file_path TEXT NOT NULL UNIQUE,
                file_hash TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                width INTEGER NOT NULL,
                height INTEGER NOT NULL,
                taken_at TEXT,
                modified_at TEXT NOT NULL,
                thumbnail_path TEXT,
                media_type TEXT NOT NULL,
                created_at TEXT NOT NULL,
                FOREIGN KEY (folder_id) REFERENCES library_folders(id) ON DELETE CASCADE
            )",
            [],
        )?;

        // Create indexes for faster lookups
        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_folder
             ON cache_entries(folder_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_cache_hash
             ON cache_entries(file_hash)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_folder
             ON media_files(folder_id)",
            [],
        )?;

        self.conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_media_hash
             ON media_files(file_hash)",
            [],
        )?;

        Ok(())
    }

    // Add a library folder
    pub fn add_library_folder(&self, path: &str, folder_hash: &str) -> Result<i64> {
        self.conn.execute(
            "INSERT OR REPLACE INTO library_folders (path, folder_hash)
             VALUES (?1, ?2)",
            [path, folder_hash],
        )?;

        Ok(self.conn.last_insert_rowid())
    }

    // Remove a library folder and all associated cache entries
    pub fn remove_library_folder(&self, path: &str) -> Result<(Vec<String>, Vec<String>)> {
        println!("DB: Removing library folder: {}", path);

        // First, get all cached file paths and original paths for this folder
        let mut stmt = self.conn.prepare(
            "SELECT ce.cached_path, ce.original_path, ce.file_hash
             FROM cache_entries ce
             JOIN library_folders lf ON ce.folder_id = lf.id
             WHERE lf.path = ?1"
        )?;

        let mut cached_paths: Vec<String> = Vec::new();
        let mut thumbnail_hashes: Vec<String> = Vec::new();

        let rows = stmt.query_map([path], |row| {
            Ok((
                row.get::<_, String>(0)?,  // cached_path
                row.get::<_, String>(1)?,  // original_path
                row.get::<_, String>(2)?,  // file_hash
            ))
        })?;

        for row in rows {
            let (cached_path, _original_path, file_hash) = row?;
            println!("DB: Found cache entry - cached: {}, hash: {}", cached_path, file_hash);
            cached_paths.push(cached_path);
            thumbnail_hashes.push(file_hash);
        }

        println!("DB: Total entries found: {} cached, {} hashes", cached_paths.len(), thumbnail_hashes.len());

        // Delete the folder (cascade will delete cache entries)
        let deleted = self.conn.execute(
            "DELETE FROM library_folders WHERE path = ?1",
            [path],
        )?;

        println!("DB: Deleted {} folder record(s)", deleted);

        Ok((cached_paths, thumbnail_hashes))
    }

    // Clear cache entries for a folder (without removing the folder itself)
    pub fn clear_folder_cache(&self, path: &str) -> Result<(Vec<String>, Vec<String>)> {
        println!("DB: Clearing cache for folder: {}", path);

        // First, get all cached file paths and hashes for this folder
        let mut stmt = self.conn.prepare(
            "SELECT ce.cached_path, ce.file_hash
             FROM cache_entries ce
             JOIN library_folders lf ON ce.folder_id = lf.id
             WHERE lf.path = ?1"
        )?;

        let mut cached_paths: Vec<String> = Vec::new();
        let mut thumbnail_hashes: Vec<String> = Vec::new();

        let rows = stmt.query_map([path], |row| {
            Ok((
                row.get::<_, String>(0)?,  // cached_path
                row.get::<_, String>(1)?,  // file_hash
            ))
        })?;

        for row in rows {
            let (cached_path, file_hash) = row?;
            println!("DB: Found cache entry - cached: {}, hash: {}", cached_path, file_hash);
            cached_paths.push(cached_path);
            thumbnail_hashes.push(file_hash);
        }

        println!("DB: Total entries found: {} cached, {} hashes", cached_paths.len(), thumbnail_hashes.len());

        // Delete cache entries for this folder
        let deleted = self.conn.execute(
            "DELETE FROM cache_entries
             WHERE folder_id IN (SELECT id FROM library_folders WHERE path = ?1)",
            [path],
        )?;

        println!("DB: Deleted {} cache entries", deleted);

        Ok((cached_paths, thumbnail_hashes))
    }

    // Get folder ID by path
    pub fn get_folder_id(&self, path: &str) -> Result<Option<i64>> {
        let mut stmt = self.conn.prepare(
            "SELECT id FROM library_folders WHERE path = ?1"
        )?;

        let result = stmt.query_row([path], |row| row.get(0))
            .optional()?;

        Ok(result)
    }

    // Add a cache entry
    pub fn add_cache_entry(
        &self,
        folder_id: i64,
        original_path: &str,
        file_hash: &str,
        cached_path: &str,
        media_type: &str,
        file_size: i64,
        cached_size: i64,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO cache_entries
             (folder_id, original_path, file_hash, cached_path, media_type, file_size, cached_size)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            rusqlite::params![
                folder_id,
                original_path,
                file_hash,
                cached_path,
                media_type,
                file_size,
                cached_size
            ],
        )?;

        Ok(())
    }

    // Get cached file path
    pub fn get_cached_path(&self, file_hash: &str) -> Result<Option<String>> {
        let mut stmt = self.conn.prepare(
            "SELECT cached_path FROM cache_entries WHERE file_hash = ?1"
        )?;

        let result = stmt.query_row([file_hash], |row| row.get(0))
            .optional()?;

        Ok(result)
    }

    // Update folder statistics
    #[allow(dead_code)]
    pub fn update_folder_stats(&self, folder_id: i64, total_files: i64) -> Result<()> {
        self.conn.execute(
            "UPDATE library_folders
             SET total_files = ?1, last_scanned = CURRENT_TIMESTAMP
             WHERE id = ?2",
            rusqlite::params![total_files, folder_id],
        )?;

        Ok(())
    }

    // Get all library folders
    pub fn get_all_folders(&self) -> Result<Vec<(String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT path, folder_hash FROM library_folders ORDER BY added_at DESC"
        )?;

        let folders = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                ))
            })?
            .collect::<SqlResult<Vec<(String, String)>>>()?;

        Ok(folders)
    }

    // Get cache statistics
    pub fn get_cache_stats(&self) -> Result<CacheStats> {
        let mut stmt = self.conn.prepare(
            "SELECT
                COUNT(*) as entry_count,
                SUM(file_size) as original_size,
                SUM(cached_size) as cached_size
             FROM cache_entries"
        )?;

        let stats = stmt.query_row([], |row| {
            Ok(CacheStats {
                entry_count: row.get(0)?,
                original_size: row.get::<_, Option<i64>>(1)?.unwrap_or(0),
                cached_size: row.get::<_, Option<i64>>(2)?.unwrap_or(0),
            })
        })?;

        Ok(stats)
    }

    // Check if a file with this hash already exists and the file actually exists on disk
    pub fn check_file_exists(&self, file_hash: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT original_path FROM cache_entries WHERE file_hash = ?1"
        )?;

        let paths: Vec<String> = stmt
            .query_map([file_hash], |row| row.get(0))?
            .filter_map(|r| r.ok())
            .collect();

        // Check if any of the files with this hash actually exist on disk
        let mut found_existing = false;
        for path in &paths {
            if std::path::Path::new(path).exists() {
                found_existing = true;
                break;
            }
        }

        // If no matching file exists on disk, clean up stale database entries
        if !paths.is_empty() && !found_existing {
            self.conn.execute(
                "DELETE FROM cache_entries WHERE file_hash = ?1",
                [file_hash],
            )?;
        }

        Ok(found_existing)
    }

    // Get all cache entries for debugging
    pub fn get_all_cache_entries(&self) -> Result<Vec<(String, String, String)>> {
        let mut stmt = self.conn.prepare(
            "SELECT file_hash, original_path, media_type FROM cache_entries ORDER BY created_at DESC LIMIT 100"
        )?;

        let entries = stmt
            .query_map([], |row| {
                Ok((
                    row.get::<_, String>(0)?,  // file_hash
                    row.get::<_, String>(1)?,  // original_path
                    row.get::<_, String>(2)?,  // media_type
                ))
            })?
            .collect::<rusqlite::Result<Vec<(String, String, String)>>>()?;

        Ok(entries)
    }

    // Get total count of entries in database
    pub fn get_total_entry_count(&self) -> Result<i64> {
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM cache_entries")?;
        let count = stmt.query_row([], |row| row.get(0))?;
        Ok(count)
    }

    // Get total count of media files in database
    pub fn get_media_files_count(&self) -> Result<i64> {
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM media_files")?;
        let count = stmt.query_row([], |row| row.get(0))?;
        Ok(count)
    }

    // Add or update a media file in the database
    pub fn upsert_media_file(
        &self,
        folder_id: i64,
        file_path: &str,
        file_hash: &str,
        file_size: i64,
        width: i32,
        height: i32,
        taken_at: Option<&str>,
        modified_at: &str,
        thumbnail_path: Option<&str>,
        media_type: &str,
        created_at: &str,
    ) -> Result<()> {
        self.conn.execute(
            "INSERT OR REPLACE INTO media_files
             (folder_id, file_path, file_hash, file_size, width, height, taken_at, modified_at, thumbnail_path, media_type, created_at)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11)",
            rusqlite::params![
                folder_id,
                file_path,
                file_hash,
                file_size,
                width,
                height,
                taken_at,
                modified_at,
                thumbnail_path,
                media_type,
                created_at,
            ],
        )?;

        Ok(())
    }

    // Load all media files from database
    pub fn load_all_media_files(&self) -> Result<Vec<MediaFileDb>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, folder_id, file_path, file_hash, file_size, width, height,
                    taken_at, modified_at, thumbnail_path, media_type, created_at
             FROM media_files
             ORDER BY modified_at DESC"
        )?;

        let files = stmt
            .query_map([], |row| {
                Ok(MediaFileDb {
                    id: row.get(0)?,
                    folder_id: row.get(1)?,
                    file_path: row.get(2)?,
                    file_hash: row.get(3)?,
                    file_size: row.get(4)?,
                    width: row.get(5)?,
                    height: row.get(6)?,
                    taken_at: row.get(7)?,
                    modified_at: row.get(8)?,
                    thumbnail_path: row.get(9)?,
                    media_type: row.get(10)?,
                    created_at: row.get(11)?,
                })
            })?
            .collect::<SqlResult<Vec<MediaFileDb>>>()?;

        Ok(files)
    }

    // Delete a specific media file by path
    pub fn delete_media_file_by_path(&self, file_path: &str) -> Result<()> {
        self.conn.execute(
            "DELETE FROM media_files WHERE file_path = ?1",
            [file_path],
        )?;

        Ok(())
    }
}

#[derive(Debug, serde::Serialize)]
pub struct MediaFileDb {
    pub id: i64,
    pub folder_id: i64,
    pub file_path: String,
    pub file_hash: String,
    pub file_size: i64,
    pub width: i32,
    pub height: i32,
    pub taken_at: Option<String>,
    pub modified_at: String,
    pub thumbnail_path: Option<String>,
    pub media_type: String,
    pub created_at: String,
}

#[derive(Debug, serde::Serialize)]
pub struct CacheStats {
    pub entry_count: i64,
    pub original_size: i64,
    pub cached_size: i64,
}

pub fn get_db_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    Ok(home.join(".pengler").join("pengler.db"))
}

// Generate a unique hash for a folder path
pub fn generate_folder_hash(path: &str) -> String {
    use blake3::Hasher;
    let mut hasher = Hasher::new();
    hasher.update(path.as_bytes());
    hasher.finalize().to_hex().to_string()
}
