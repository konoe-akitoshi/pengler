use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use anyhow::Result;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub library_folders: Vec<String>,
    pub cache_folder: String,
    #[serde(default = "default_quality")]
    pub optimization_quality: u8,
    #[serde(default = "default_max_resolution")]
    pub max_resolution: u32,
}

fn default_quality() -> u8 {
    85
}

fn default_max_resolution() -> u32 {
    1920
}

impl Default for Config {
    fn default() -> Self {
        let cache_folder = get_default_cache_folder()
            .unwrap_or_else(|_| String::from("~/.pengler/cache"));

        Self {
            library_folders: Vec::new(),
            cache_folder,
            optimization_quality: 85,
            max_resolution: 1920,
        }
    }
}

impl Config {
    pub fn load() -> Result<Self> {
        let config_path = get_config_path()?;

        if config_path.exists() {
            let contents = fs::read_to_string(&config_path)?;
            let config: Config = toml::from_str(&contents)?;
            Ok(config)
        } else {
            let config = Config::default();
            config.save()?;
            Ok(config)
        }
    }

    pub fn save(&self) -> Result<()> {
        let config_path = get_config_path()?;

        // Create parent directory if it doesn't exist
        if let Some(parent) = config_path.parent() {
            fs::create_dir_all(parent)?;
        }

        let toml_string = toml::to_string_pretty(self)?;
        fs::write(&config_path, toml_string)?;

        Ok(())
    }

    pub fn add_library_folder(&mut self, folder: String) -> Result<()> {
        if !self.library_folders.contains(&folder) {
            self.library_folders.push(folder);
            self.save()?;
        }
        Ok(())
    }

    pub fn remove_library_folder(&mut self, folder: &str) -> Result<()> {
        self.library_folders.retain(|f| f != folder);
        self.save()?;
        Ok(())
    }

    pub fn set_cache_folder(&mut self, folder: String) -> Result<()> {
        self.cache_folder = folder;
        self.save()?;
        Ok(())
    }
}

pub fn get_config_path() -> Result<PathBuf> {
    let home = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    Ok(home.join(".pengler").join("config.toml"))
}

pub fn get_default_cache_folder() -> Result<String> {
    let home = dirs::home_dir()
        .ok_or_else(|| anyhow::anyhow!("Cannot find home directory"))?;
    Ok(home.join(".pengler").join("cache").to_string_lossy().to_string())
}

#[tauri::command]
pub async fn get_config() -> Result<Config, String> {
    Config::load().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn update_config(config: Config) -> Result<(), String> {
    config.save().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn add_library_folder(folder: String) -> Result<Config, String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.add_library_folder(folder).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub async fn remove_library_folder(folder: String) -> Result<Config, String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.remove_library_folder(&folder).map_err(|e| e.to_string())?;
    Ok(config)
}

#[tauri::command]
pub async fn set_cache_folder(folder: String) -> Result<Config, String> {
    let mut config = Config::load().map_err(|e| e.to_string())?;
    config.set_cache_folder(folder).map_err(|e| e.to_string())?;
    Ok(config)
}
