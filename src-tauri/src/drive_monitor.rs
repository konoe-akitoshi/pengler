use std::collections::HashSet;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;
use tauri::{AppHandle, Emitter};

pub struct DriveMonitor {
    known_drives: Arc<Mutex<HashSet<String>>>,
    is_running: Arc<Mutex<bool>>,
}

impl DriveMonitor {
    pub fn new() -> Self {
        DriveMonitor {
            known_drives: Arc::new(Mutex::new(HashSet::new())),
            is_running: Arc::new(Mutex::new(false)),
        }
    }

    pub fn start(&self, app_handle: AppHandle) {
        let mut is_running = self.is_running.lock().unwrap();
        if *is_running {
            println!("Drive monitor already running");
            return;
        }
        *is_running = true;
        drop(is_running);

        let known_drives = Arc::clone(&self.known_drives);
        let is_running_clone = Arc::clone(&self.is_running);

        // Initialize with current drives
        if let Ok(current_drives) = detect_removable_drives_internal() {
            let mut drives = known_drives.lock().unwrap();
            for drive in current_drives {
                drives.insert(drive);
            }
        }

        thread::spawn(move || {
            println!("Drive monitor started");

            while *is_running_clone.lock().unwrap() {
                // Check for new drives
                if let Ok(current_drives) = detect_removable_drives_internal() {
                    let mut drives = known_drives.lock().unwrap();

                    // Check for newly added drives
                    for drive in &current_drives {
                        if !drives.contains(drive) {
                            println!("New removable drive detected: {}", drive);
                            drives.insert(drive.clone());

                            // Emit event to frontend
                            let _ = app_handle.emit("sd-card-inserted", drive.clone());
                        }
                    }

                    // Check for removed drives
                    let current_set: HashSet<String> = current_drives.into_iter().collect();
                    drives.retain(|drive| {
                        if !current_set.contains(drive) {
                            println!("Removable drive removed: {}", drive);
                            let _ = app_handle.emit("sd-card-removed", drive.clone());
                            false
                        } else {
                            true
                        }
                    });
                }

                // Check every 2 seconds
                thread::sleep(Duration::from_secs(2));
            }

            println!("Drive monitor stopped");
        });
    }

    #[allow(dead_code)]
    pub fn stop(&self) {
        let mut is_running = self.is_running.lock().unwrap();
        *is_running = false;
        println!("Drive monitor stopping...");
    }
}

fn detect_removable_drives_internal() -> Result<Vec<String>, String> {
    let mut drives = Vec::new();

    #[cfg(target_os = "windows")]
    {
        // Check all drive letters for DCIM folder (indicates camera/SD card)
        for drive_letter in b'A'..=b'Z' {
            let drive = format!("{}:\\", drive_letter as char);
            let dcim_path = PathBuf::from(&drive).join("DCIM");

            if dcim_path.exists() {
                drives.push(drive);
            }
        }
    }

    #[cfg(target_os = "macos")]
    {
        // Check /Volumes for removable drives with DCIM
        if let Ok(entries) = std::fs::read_dir("/Volumes") {
            for entry in entries.filter_map(|e| e.ok()) {
                let path = entry.path();
                let dcim_path = path.join("DCIM");

                if dcim_path.exists() {
                    if let Some(path_str) = path.to_str() {
                        drives.push(path_str.to_string());
                    }
                }
            }
        }
    }

    #[cfg(target_os = "linux")]
    {
        // Check /media and /mnt for removable drives with DCIM
        for base_dir in ["/media", "/mnt"] {
            if let Ok(entries) = std::fs::read_dir(base_dir) {
                for entry in entries.filter_map(|e| e.ok()) {
                    let path = entry.path();

                    // Check if it's a directory
                    if !path.is_dir() {
                        continue;
                    }

                    // For /media, go one level deeper (username subdirs)
                    if base_dir == "/media" {
                        if let Ok(sub_entries) = std::fs::read_dir(&path) {
                            for sub_entry in sub_entries.filter_map(|e| e.ok()) {
                                let sub_path = sub_entry.path();
                                let dcim_path = sub_path.join("DCIM");

                                if dcim_path.exists() {
                                    if let Some(path_str) = sub_path.to_str() {
                                        drives.push(path_str.to_string());
                                    }
                                }
                            }
                        }
                    } else {
                        // For /mnt, check directly
                        let dcim_path = path.join("DCIM");

                        if dcim_path.exists() {
                            if let Some(path_str) = path.to_str() {
                                drives.push(path_str.to_string());
                            }
                        }
                    }
                }
            }
        }
    }

    Ok(drives)
}
