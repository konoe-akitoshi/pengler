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

    // Check if a file with this hash already exists
    pub fn check_file_exists(&self, file_hash: &str) -> Result<bool> {
        let mut stmt = self.conn.prepare(
            "SELECT COUNT(*) FROM cache_entries WHERE file_hash = ?1"
        )?;

        let count: i64 = stmt.query_row([file_hash], |row| row.get(0))?;

        Ok(count > 0)
    }
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
