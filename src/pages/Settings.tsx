import { useState, useEffect } from 'react';
import { open } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMediaStore } from '../stores/mediaStore';
import { MediaFile } from '../types/media';
import { Config } from '../types/config';

interface CacheStats {
  entry_count: number;
  original_size: number;
  cached_size: number;
}

function Settings() {
  const { setMediaFiles, setIsScanning, setScanProgress, clearMediaFiles } = useMediaStore();

  const [config, setConfig] = useState<Config | null>(null);
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);

  useEffect(() => {
    loadConfig();
    loadCacheStats();
  }, []);

  const loadConfig = async () => {
    try {
      const cfg = await invoke<Config>('get_config');
      setConfig(cfg);
    } catch (error) {
      console.error('Failed to load config:', error);
    }
  };

  const loadCacheStats = async () => {
    try {
      const stats = await invoke<CacheStats>('get_database_cache_stats');
      setCacheStats(stats);
    } catch (error) {
      console.error('Failed to load cache stats:', error);
    }
  };

  const handleAddFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select library folder',
      });

      if (selected && typeof selected === 'string') {
        // Add to config
        const updatedConfig = await invoke<Config>('add_library_folder', {
          folder: selected,
        });
        setConfig(updatedConfig);

        // Register in database
        await invoke('register_library_folder', {
          folderPath: selected,
        });

        // Scan and optimize the folder
        await scanAndOptimizeFolder(selected);
      }
    } catch (error) {
      console.error('Failed to add folder:', error);
    }
  };

  const handleRemoveFolder = async (folder: string) => {
    try {
      // Remove from config
      const updatedConfig = await invoke<Config>('remove_library_folder', {
        folder,
      });
      setConfig(updatedConfig);

      // Unregister from database (will delete cached files)
      await invoke('unregister_library_folder', {
        folderPath: folder,
      });

      // Reload cache stats
      loadCacheStats();
    } catch (error) {
      console.error('Failed to remove folder:', error);
    }
  };

  const scanAndOptimizeFolder = async (folderPath: string) => {
    setIsScanning(true);
    setScanProgress(0);
    clearMediaFiles();

    try {
      // Scan folder
      const files = await invoke<MediaFile[]>('scan_folder', {
        path: folderPath,
      });

      // Sort by date
      const sortedFiles = files.sort((a, b) => {
        const dateA = new Date(a.takenAt || a.modifiedAt).getTime();
        const dateB = new Date(b.takenAt || b.modifiedAt).getTime();
        return dateB - dateA;
      });

      setMediaFiles(sortedFiles);
      setScanProgress(50);

      // Generate thumbnails and optimize in background
      Promise.all(
        sortedFiles.map(async (file, index) => {
          try {
            // Generate thumbnail
            const thumbnailPath = await invoke<string>('generate_thumbnail', {
              filePath: file.filePath,
              fileHash: file.fileHash,
            });
            file.thumbnailPath = thumbnailPath;

            // Optimize media file
            await invoke<string>('optimize_media_file', {
              folderPath,
              filePath: file.filePath,
              fileHash: file.fileHash,
              mediaType: file.mediaType,
            });

            setScanProgress(50 + Math.round(((index + 1) / sortedFiles.length) * 50));
          } catch (error) {
            console.error(`Failed to process ${file.filePath}:`, error);
          }
        })
      ).then(() => {
        setMediaFiles([...sortedFiles]);
        setIsScanning(false);
        setScanProgress(100);
        loadCacheStats();
      });
    } catch (error) {
      console.error('Failed to scan folder:', error);
      setIsScanning(false);
    }
  };

  const handleSelectCacheFolder = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select cache folder',
      });

      if (selected && typeof selected === 'string') {
        const updatedConfig = await invoke<Config>('set_cache_folder', {
          folder: selected,
        });
        setConfig(updatedConfig);
      }
    } catch (error) {
      console.error('Failed to select cache folder:', error);
    }
  };

  const handleCleanupOrphanedCache = async () => {
    try {
      const cleanedCount = await invoke<number>('cleanup_orphaned_cache');
      alert(`Cleaned ${cleanedCount} orphaned cache files`);
      loadCacheStats();
    } catch (error) {
      console.error('Failed to cleanup cache:', error);
    }
  };

  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i];
  };

  if (!config) {
    return (
      <div className="flex-1 flex items-center justify-center">
        <div className="text-gray-400">Loading settings...</div>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-auto p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold">Settings</h1>

        {/* Library Folders */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">LIBRARY FOLDERS</h2>

          {config.library_folders.length > 0 ? (
            <div className="space-y-2 mb-3">
              {config.library_folders.map((folder) => (
                <div key={folder} className="bg-gray-800 rounded p-4 border border-gray-700 flex items-center justify-between">
                  <div className="flex-1 min-w-0">
                    <div className="text-sm text-gray-200 font-mono truncate">{folder}</div>
                  </div>
                  <button
                    onClick={() => handleRemoveFolder(folder)}
                    className="ml-4 text-red-400 hover:text-red-300 text-sm"
                  >
                    Remove
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="bg-gray-800 rounded p-4 border border-gray-700 mb-3">
              <div className="text-sm text-gray-400">No library folders added yet</div>
            </div>
          )}

          <button
            onClick={handleAddFolder}
            disabled={isOptimizing}
            className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Add Folder
          </button>

          <div className="mt-3 text-xs text-gray-400">
            Pengler will scan these folders for photos and videos. Files will be optimized and cached for faster viewing.
          </div>
        </section>

        {/* Cache Settings */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">CACHE SETTINGS</h2>

          <div className="bg-gray-800 rounded p-4 border border-gray-700 mb-3">
            <div className="text-xs text-gray-400 mb-1">Cache folder</div>
            <div className="text-sm text-gray-200 font-mono break-all">{config.cache_folder}</div>
          </div>

          <button
            onClick={handleSelectCacheFolder}
            className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Change Cache Folder
          </button>

          {cacheStats && (
            <div className="mt-4 bg-gray-800 rounded p-4 border border-gray-700">
              <div className="text-sm font-medium mb-2">Cache Statistics</div>
              <div className="grid grid-cols-3 gap-4 text-sm">
                <div>
                  <div className="text-gray-400">Cached files</div>
                  <div className="text-lg font-semibold">{cacheStats.entry_count}</div>
                </div>
                <div>
                  <div className="text-gray-400">Original size</div>
                  <div className="text-lg font-semibold">{formatBytes(cacheStats.original_size)}</div>
                </div>
                <div>
                  <div className="text-gray-400">Cached size</div>
                  <div className="text-lg font-semibold">{formatBytes(cacheStats.cached_size)}</div>
                </div>
              </div>
              {cacheStats.original_size > 0 && (
                <div className="mt-2 text-xs text-green-400">
                  Saved {Math.round((1 - cacheStats.cached_size / cacheStats.original_size) * 100)}% space
                </div>
              )}
            </div>
          )}

          <button
            onClick={handleCleanupOrphanedCache}
            className="mt-3 bg-gray-700 hover:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
          >
            Cleanup Orphaned Cache
          </button>
        </section>

        {/* Optimization Settings */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">OPTIMIZATION SETTINGS</h2>

          <div className="bg-gray-800 rounded p-4 border border-gray-700 space-y-4">
            <div>
              <label className="text-sm text-gray-300 block mb-2">
                Quality ({config.optimization_quality}%)
              </label>
              <input
                type="range"
                min="50"
                max="100"
                value={config.optimization_quality}
                onChange={(e) => {
                  const newConfig = { ...config, optimization_quality: parseInt(e.target.value) };
                  setConfig(newConfig);
                  invoke('update_config', { config: newConfig });
                }}
                className="w-full"
              />
              <div className="text-xs text-gray-400 mt-1">
                Higher quality means larger file sizes
              </div>
            </div>

            <div>
              <label className="text-sm text-gray-300 block mb-2">
                Max Resolution ({config.max_resolution}px)
              </label>
              <select
                value={config.max_resolution}
                onChange={(e) => {
                  const newConfig = { ...config, max_resolution: parseInt(e.target.value) };
                  setConfig(newConfig);
                  invoke('update_config', { config: newConfig });
                }}
                className="bg-gray-700 text-white rounded px-3 py-2 text-sm w-full"
              >
                <option value="1280">1280px (HD)</option>
                <option value="1920">1920px (Full HD)</option>
                <option value="2560">2560px (2K)</option>
                <option value="3840">3840px (4K)</option>
              </select>
              <div className="text-xs text-gray-400 mt-1">
                Images and videos will be scaled down to this resolution
              </div>
            </div>
          </div>
        </section>

        {/* About */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">ABOUT</h2>
          <div className="bg-gray-800 rounded p-4 border border-gray-700">
            <div className="flex items-center gap-3 mb-2">
              <div className="text-2xl">📷</div>
              <div>
                <div className="font-semibold">Pengler</div>
                <div className="text-xs text-gray-400">Version 0.1.0</div>
              </div>
            </div>
            <p className="text-sm text-gray-400">
              Ultra-lightweight photo and video library with intelligent caching
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}

export default Settings;
