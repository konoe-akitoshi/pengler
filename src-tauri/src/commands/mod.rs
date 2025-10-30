pub mod scanner;
pub mod thumbnail;
pub mod cache;
pub mod cache_manager;
pub mod optimizer;
pub mod task_commands;
pub mod watcher_commands;
pub mod file_count;
pub mod import;

pub use scanner::scan_folder;
pub use thumbnail::{generate_thumbnail, get_cache_stats, clear_cache};
pub use cache::{save_media_files, load_media_files};
pub use cache_manager::{
    register_library_folder,
    unregister_library_folder,
    get_library_folders,
    get_cached_file_path,
    register_cache_entry,
    get_database_cache_stats,
    cleanup_orphaned_cache,
    clear_folder_cache,
};
pub use optimizer::{
    optimize_media_file,
    batch_optimize_folder,
};
pub use task_commands::{
    create_optimization_task,
    get_all_tasks,
    pause_task,
    resume_task,
    stop_task,
    check_folder_has_running_task,
    remove_optimization_task,
    reset_optimization_task,
};
pub use watcher_commands::{
    start_watching_folders,
    stop_watching_folder,
    get_watched_folders,
};
pub use file_count::count_media_files;
pub use import::{
    scan_import_source,
    import_files,
    detect_removable_drives,
};
