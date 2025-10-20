// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod commands;
mod utils;

use commands::{
    scan_folder,
    generate_thumbnail,
    get_cache_stats,
    clear_cache,
    save_media_files,
    load_media_files,
};

fn main() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_shell::init())
        .invoke_handler(tauri::generate_handler![
            scan_folder,
            generate_thumbnail,
            get_cache_stats,
            clear_cache,
            save_media_files,
            load_media_files,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
