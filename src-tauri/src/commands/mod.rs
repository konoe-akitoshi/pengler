pub mod scanner;
pub mod thumbnail;
pub mod cache;
pub mod cache_manager;
pub mod optimizer;

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
};
pub use optimizer::{
    optimize_media_file,
    batch_optimize_folder,
};
