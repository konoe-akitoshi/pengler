// Prevents additional console window on Windows in release mode
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod models;
mod commands;
mod utils;
mod config;
mod db;
mod task_manager;

use commands::{
    scan_folder,
    generate_thumbnail,
    get_cache_stats,
    clear_cache,
    save_media_files,
    load_media_files,
    register_library_folder,
    unregister_library_folder,
    get_library_folders,
    get_cached_file_path,
    register_cache_entry,
    get_database_cache_stats,
    cleanup_orphaned_cache,
    clear_folder_cache,
    optimize_media_file,
    batch_optimize_folder,
    create_optimization_task,
    get_all_tasks,
    pause_task,
    resume_task,
    stop_task,
    check_folder_has_running_task,
    remove_optimization_task,
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
            register_library_folder,
            unregister_library_folder,
            get_library_folders,
            get_cached_file_path,
            register_cache_entry,
            get_database_cache_stats,
            cleanup_orphaned_cache,
            clear_folder_cache,
            optimize_media_file,
            batch_optimize_folder,
            create_optimization_task,
            get_all_tasks,
            pause_task,
            resume_task,
            stop_task,
            check_folder_has_running_task,
            remove_optimization_task,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
