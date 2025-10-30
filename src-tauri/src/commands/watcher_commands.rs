use std::sync::Mutex;
use tauri::{AppHandle, State};
use crate::file_watcher::FolderWatcher;

pub struct WatcherState(pub Mutex<Option<FolderWatcher>>);

#[tauri::command]
pub async fn start_watching_folders(
    app_handle: AppHandle,
    state: State<'_, WatcherState>,
    folder_paths: Vec<String>,
) -> Result<(), String> {
    let mut watcher_guard = state.0.lock().unwrap();

    // Initialize watcher if not already initialized
    if watcher_guard.is_none() {
        let watcher = FolderWatcher::new(app_handle.clone())
            .map_err(|e| format!("Failed to create file watcher: {}", e))?;
        *watcher_guard = Some(watcher);
    }

    let watcher = watcher_guard.as_mut().unwrap();

    // Watch all specified folders
    for folder_path in folder_paths {
        watcher
            .watch_folder(std::path::Path::new(&folder_path))
            .map_err(|e| format!("Failed to watch folder {}: {}", folder_path, e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_watching_folder(
    state: State<'_, WatcherState>,
    folder_path: String,
) -> Result<(), String> {
    let mut watcher_guard = state.0.lock().unwrap();

    if let Some(watcher) = watcher_guard.as_mut() {
        watcher
            .unwatch_folder(std::path::Path::new(&folder_path))
            .map_err(|e| format!("Failed to stop watching folder: {}", e))?;
    }

    Ok(())
}

#[tauri::command]
pub async fn get_watched_folders(state: State<'_, WatcherState>) -> Result<Vec<String>, String> {
    let watcher_guard = state.0.lock().unwrap();

    if let Some(watcher) = watcher_guard.as_ref() {
        Ok(watcher
            .get_watched_folders()
            .iter()
            .map(|p| p.to_string_lossy().to_string())
            .collect())
    } else {
        Ok(vec![])
    }
}
