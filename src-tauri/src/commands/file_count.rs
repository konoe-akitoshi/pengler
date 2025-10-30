use std::path::PathBuf;
use walkdir::WalkDir;

use crate::models::is_media_file;

#[tauri::command]
pub async fn count_media_files(path: String) -> Result<usize, String> {
    let folder_path = PathBuf::from(&path);
    if !folder_path.exists() || !folder_path.is_dir() {
        return Err("Invalid folder path".to_string());
    }

    // Just count files without reading metadata
    let count = WalkDir::new(&folder_path)
        .follow_links(true)
        .into_iter()
        .filter_map(|e| e.ok())
        .filter(|e| e.file_type().is_file())
        .filter(|e| {
            e.path()
                .to_str()
                .and_then(|s| is_media_file(s))
                .is_some()
        })
        .count();

    Ok(count)
}
