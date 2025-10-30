use std::path::{Path, PathBuf};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use notify::{Event, RecommendedWatcher, RecursiveMode, Watcher, EventKind};
use notify_debouncer_full::{new_debouncer, Debouncer, FileIdMap};
use anyhow::Result;
use tauri::{AppHandle, Emitter};

use crate::models::is_media_file;

pub struct FolderWatcher {
    debouncer: Debouncer<RecommendedWatcher, FileIdMap>,
    watched_folders: Arc<Mutex<Vec<PathBuf>>>,
}

impl FolderWatcher {
    pub fn new(app_handle: AppHandle) -> Result<Self> {
        let watched_folders = Arc::new(Mutex::new(Vec::new()));
        let watched_folders_clone = watched_folders.clone();

        // Create debouncer with 2 second debounce
        let debouncer = new_debouncer(
            Duration::from_secs(2),
            None,
            move |result: Result<Vec<notify_debouncer_full::DebouncedEvent>, Vec<notify::Error>>| {
                match result {
                    Ok(events) => {
                        for event in events {
                            handle_file_event(&app_handle, &event.event);
                        }
                    }
                    Err(errors) => {
                        for error in errors {
                            eprintln!("File watcher error: {:?}", error);
                        }
                    }
                }
            },
        )?;

        Ok(Self {
            debouncer,
            watched_folders: watched_folders_clone,
        })
    }

    pub fn watch_folder(&mut self, folder_path: &Path) -> Result<()> {
        println!("Starting to watch folder: {}", folder_path.display());

        // Add to watcher
        self.debouncer
            .watcher()
            .watch(folder_path, RecursiveMode::Recursive)?;

        // Add to watched folders list
        let mut folders = self.watched_folders.lock().unwrap();
        if !folders.contains(&folder_path.to_path_buf()) {
            folders.push(folder_path.to_path_buf());
        }

        Ok(())
    }

    pub fn unwatch_folder(&mut self, folder_path: &Path) -> Result<()> {
        println!("Stopping watch on folder: {}", folder_path.display());

        // Remove from watcher
        self.debouncer.watcher().unwatch(folder_path)?;

        // Remove from watched folders list
        let mut folders = self.watched_folders.lock().unwrap();
        folders.retain(|f| f != folder_path);

        Ok(())
    }

    pub fn get_watched_folders(&self) -> Vec<PathBuf> {
        self.watched_folders.lock().unwrap().clone()
    }
}

fn handle_file_event(app_handle: &AppHandle, event: &Event) {
    match &event.kind {
        EventKind::Create(_) | EventKind::Modify(_) => {
            for path in &event.paths {
                if let Some(path_str) = path.to_str() {
                    if path.is_file() && is_media_file(path_str).is_some() {
                        println!("New/modified media file detected: {}", path.display());

                        // Emit event to frontend
                        if let Err(e) = app_handle.emit("file-added", path.to_string_lossy().to_string()) {
                            eprintln!("Failed to emit file-added event: {}", e);
                        }
                    }
                }
            }
        }
        EventKind::Remove(_) => {
            for path in &event.paths {
                if let Some(path_str) = path.to_str() {
                    if is_media_file(path_str).is_some() {
                        println!("Media file removed: {}", path.display());

                        // Emit event to frontend
                        if let Err(e) = app_handle.emit("file-removed", path.to_string_lossy().to_string()) {
                            eprintln!("Failed to emit file-removed event: {}", e);
                        }
                    }
                }
            }
        }
        _ => {}
    }
}
