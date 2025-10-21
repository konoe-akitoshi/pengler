use crate::task_manager::{TASK_MANAGER, TaskInfo};

#[tauri::command]
pub async fn create_optimization_task(folder_path: String, total_files: usize) -> Result<(), String> {
    TASK_MANAGER.add_task(folder_path, total_files);
    Ok(())
}

#[tauri::command]
pub async fn get_all_tasks() -> Result<Vec<TaskInfo>, String> {
    Ok(TASK_MANAGER.get_all_tasks())
}

#[tauri::command]
pub async fn pause_task(folder_path: String) -> Result<(), String> {
    TASK_MANAGER.pause_task(&folder_path)
}

#[tauri::command]
pub async fn resume_task(folder_path: String) -> Result<(), String> {
    TASK_MANAGER.resume_task(&folder_path)
}

#[tauri::command]
pub async fn stop_task(folder_path: String) -> Result<(), String> {
    TASK_MANAGER.stop_task(&folder_path)
}

#[tauri::command]
pub async fn check_folder_has_running_task(folder_path: String) -> Result<bool, String> {
    Ok(TASK_MANAGER.has_running_task(&folder_path))
}

#[tauri::command]
pub async fn remove_optimization_task(folder_path: String) -> Result<(), String> {
    TASK_MANAGER.remove_task(&folder_path);
    Ok(())
}
