use std::collections::HashMap;
use std::sync::{Arc, Mutex};
use std::sync::atomic::{AtomicBool, Ordering};

#[derive(Clone, Debug, serde::Serialize)]
pub struct TaskInfo {
    pub folder_path: String,
    pub total_files: usize,
    pub processed_files: usize,
    pub optimized_files: usize,
    pub failed_files: usize,
    pub status: TaskStatus,
}

#[derive(Clone, Debug, serde::Serialize, PartialEq)]
#[serde(rename_all = "lowercase")]
pub enum TaskStatus {
    Running,
    Paused,
    Stopped,
    Completed,
}

pub struct Task {
    pub info: Arc<Mutex<TaskInfo>>,
    pub should_pause: Arc<AtomicBool>,
    pub should_stop: Arc<AtomicBool>,
}

impl Task {
    pub fn new(folder_path: String, total_files: usize) -> Self {
        Self {
            info: Arc::new(Mutex::new(TaskInfo {
                folder_path,
                total_files,
                processed_files: 0,
                optimized_files: 0,
                failed_files: 0,
                status: TaskStatus::Running,
            })),
            should_pause: Arc::new(AtomicBool::new(false)),
            should_stop: Arc::new(AtomicBool::new(false)),
        }
    }

    pub fn increment_processed(&self) {
        let mut info = self.info.lock().unwrap();
        info.processed_files += 1;
    }

    pub fn increment_optimized(&self) {
        let mut info = self.info.lock().unwrap();
        info.optimized_files += 1;
    }

    pub fn increment_failed(&self) {
        let mut info = self.info.lock().unwrap();
        info.failed_files += 1;
    }

    pub fn pause(&self) {
        self.should_pause.store(true, Ordering::SeqCst);
        let mut info = self.info.lock().unwrap();
        info.status = TaskStatus::Paused;
    }

    pub fn resume(&self) {
        self.should_pause.store(false, Ordering::SeqCst);
        let mut info = self.info.lock().unwrap();
        info.status = TaskStatus::Running;
    }

    pub fn stop(&self) {
        self.should_stop.store(true, Ordering::SeqCst);
        let mut info = self.info.lock().unwrap();
        info.status = TaskStatus::Stopped;
    }

    pub fn complete(&self) {
        let mut info = self.info.lock().unwrap();
        info.status = TaskStatus::Completed;
    }

    pub fn is_paused(&self) -> bool {
        self.should_pause.load(Ordering::SeqCst)
    }

    pub fn is_stopped(&self) -> bool {
        self.should_stop.load(Ordering::SeqCst)
    }

    pub fn get_info(&self) -> TaskInfo {
        self.info.lock().unwrap().clone()
    }
}

pub struct TaskManager {
    tasks: Arc<Mutex<HashMap<String, Arc<Task>>>>,
}

impl TaskManager {
    pub fn new() -> Self {
        Self {
            tasks: Arc::new(Mutex::new(HashMap::new())),
        }
    }

    pub fn add_task(&self, folder_path: String, total_files: usize) -> Arc<Task> {
        let task = Arc::new(Task::new(folder_path.clone(), total_files));
        let mut tasks = self.tasks.lock().unwrap();
        tasks.insert(folder_path, task.clone());
        task
    }

    pub fn remove_task(&self, folder_path: &str) {
        let mut tasks = self.tasks.lock().unwrap();
        tasks.remove(folder_path);
    }

    pub fn get_task(&self, folder_path: &str) -> Option<Arc<Task>> {
        let tasks = self.tasks.lock().unwrap();
        tasks.get(folder_path).cloned()
    }

    pub fn has_running_task(&self, folder_path: &str) -> bool {
        let tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get(folder_path) {
            let info = task.get_info();
            matches!(info.status, TaskStatus::Running | TaskStatus::Paused)
        } else {
            false
        }
    }

    pub fn get_all_tasks(&self) -> Vec<TaskInfo> {
        let tasks = self.tasks.lock().unwrap();
        tasks.values()
            .map(|task| task.get_info())
            .collect()
    }

    pub fn pause_task(&self, folder_path: &str) -> Result<(), String> {
        let tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get(folder_path) {
            task.pause();
            Ok(())
        } else {
            Err(format!("Task not found for folder: {}", folder_path))
        }
    }

    pub fn resume_task(&self, folder_path: &str) -> Result<(), String> {
        let tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get(folder_path) {
            task.resume();
            Ok(())
        } else {
            Err(format!("Task not found for folder: {}", folder_path))
        }
    }

    pub fn stop_task(&self, folder_path: &str) -> Result<(), String> {
        let tasks = self.tasks.lock().unwrap();
        if let Some(task) = tasks.get(folder_path) {
            task.stop();
            Ok(())
        } else {
            Err(format!("Task not found for folder: {}", folder_path))
        }
    }
}

// Global task manager instance
lazy_static::lazy_static! {
    pub static ref TASK_MANAGER: TaskManager = TaskManager::new();
}
