// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod commands;
mod utils;
mod config;

use commands::{
    scan_folder,
    generate_thumbnail,
    get_cache_stats,
    clear_cache,
    save_media_files,
    load_media_files,
};
use config::{
    get_config,
    update_config,
    add_library_folder,
    remove_library_folder,
    set_cache_folder,
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
            get_config,
            update_config,
            add_library_folder,
            remove_library_folder,
            set_cache_folder,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
