import { useState, useEffect } from 'react';
import { open, confirm } from '@tauri-apps/plugin-dialog';
import { invoke } from '@tauri-apps/api/core';
import { useMediaStore } from '../stores/mediaStore';
import { useConfigStore } from '../stores/configStore';
import { MediaFile } from '../types/media';
import { Config } from '../types/config';

interface CacheStats {
  entry_count: number;
  original_size: number;
  cached_size: number;
}

interface OptimizationJob {
  id: string;
  filePath: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  progress: number;
  error?: string;
}

type SettingsTab = 'library' | 'tasks' | 'optimization' | 'about';

function Settings() {
  const { setMediaFiles, clearMediaFiles, removeMediaFromFolder } = useMediaStore();
  const { config, loadConfig, updateConfig } = useConfigStore();

  const [activeTab, setActiveTab] = useState<SettingsTab>('library');
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isOptimizing, setIsOptimizing] = useState(false);
  const [optimizationJobs, setOptimizationJobs] = useState<OptimizationJob[]>([]);

  useEffect(() => {
    loadConfig();
    loadCacheStats();
  }, [loadConfig]);

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
        updateConfig(updatedConfig);

        // Register in database
        await invoke('register_library_folder', {
          folderPath: selected,
        });
      }
    } catch (error) {
      console.error('Failed to add folder:', error);
    }
  };

  const handleLoadLibrary = async () => {
    if (!config) return;

    setIsOptimizing(true);
    clearMediaFiles();
    setOptimizationJobs([]);

    try {
      // Get all registered library folders
      const folders = config.library_folders;

      if (folders.length === 0) {
        alert('No library folders registered. Please add a folder first.');
        return;
      }

      // Scan all folders
      const allFiles: MediaFile[] = [];
      for (const folder of folders) {
        try {
          const files = await invoke<MediaFile[]>('scan_folder', {
            path: folder,
          });
          allFiles.push(...files);
        } catch (error) {
          console.error(`Failed to scan folder ${folder}:`, error);
        }
      }

      // Sort by date
      const sortedFiles = allFiles.sort((a, b) => {
        const dateA = new Date(a.takenAt || a.modifiedAt).getTime();
        const dateB = new Date(b.takenAt || b.modifiedAt).getTime();
        return dateB - dateA;
      });

      setMediaFiles(sortedFiles);

      // Create optimization jobs
      const jobs: OptimizationJob[] = sortedFiles.map(file => ({
        id: file.fileHash,
        filePath: file.filePath,
        status: 'pending',
        progress: 0,
      }));
      setOptimizationJobs(jobs);

      // Group files by folder and create tasks for each folder
      const folderFiles = new Map<string, MediaFile[]>();
      const fileToFolder = new Map<string, string>();

      for (const folder of folders) {
        const folderNormalized = folder.replace(/\\/g, '/').replace(/\/$/, ''); // Remove trailing slash
        const filesInFolder: MediaFile[] = [];

        sortedFiles.forEach(file => {
          const fileNormalized = file.filePath.replace(/\\/g, '/');
          // Check if file starts with folder path (with or without trailing slash)
          if (fileNormalized.startsWith(folderNormalized + '/') || fileNormalized === folderNormalized) {
            fileToFolder.set(file.filePath, folder);
            filesInFolder.push(file);
          }
        });

        if (filesInFolder.length > 0) {
          folderFiles.set(folder, filesInFolder);
        }
      }

      // Create tasks for each folder
      for (const [folder, files] of folderFiles.entries()) {
        try {
          await invoke('create_optimization_task', {
            folderPath: folder,
            totalFiles: files.length,
          });
          console.log(`Created task for folder ${folder} with ${files.length} files`);
        } catch (error) {
          console.error(`Failed to create task for folder ${folder}:`, error);
        }
      }

      sortedFiles.forEach(async (file) => {
        updateJobStatus(file.fileHash, 'processing', 0);

        try {
          // Generate thumbnail
          const thumbnailPath = await invoke<string>('generate_thumbnail', {
            filePath: file.filePath,
            fileHash: file.fileHash,
          });
          file.thumbnailPath = thumbnailPath;
          updateJobStatus(file.fileHash, 'processing', 50);

          // Get the library folder for this file
          const libraryFolder = fileToFolder.get(file.filePath);
          if (!libraryFolder) {
            console.error(`Could not find library folder for file: ${file.filePath}`);
            updateJobStatus(file.fileHash, 'failed', 0, 'Library folder not found');
            return;
          }

          // Optimize media file
          await invoke<string>('optimize_media_file', {
            folderPath: libraryFolder,
            filePath: file.filePath,
            fileHash: file.fileHash,
            mediaType: file.mediaType,
          });

          updateJobStatus(file.fileHash, 'completed', 100);
        } catch (error) {
          console.error(`Failed to process ${file.filePath}:`, error);
          updateJobStatus(file.fileHash, 'failed', 0, String(error));
        }
      });

      // Start watching folders for changes
      try {
        await invoke('start_watching_folders', {
          folderPaths: folders,
        });
        console.log('Started watching folders for changes');
      } catch (error) {
        console.error('Failed to start file watcher:', error);
      }

      // Reload cache stats after a delay
      setTimeout(() => {
        loadCacheStats();
        setIsOptimizing(false);
      }, 5000);
    } catch (error) {
      console.error('Failed to load library:', error);
      setIsOptimizing(false);
    }
  };

  const updateJobStatus = (id: string, status: OptimizationJob['status'], progress: number, error?: string) => {
    setOptimizationJobs(prev =>
      prev.map(job =>
        job.id === id ? { ...job, status, progress, error } : job
      )
    );
  };

  const handleRemoveFolder = async (folder: string) => {
    try {
      console.log('handleRemoveFolder called for:', folder);

      // Check if there's a running task for this folder
      const hasRunningTask = await invoke<boolean>('check_folder_has_running_task', {
        folderPath: folder,
      });

      if (hasRunningTask) {
        alert(
          `Cannot remove folder while optimization is in progress.\n\nFolder: ${folder}\n\nPlease pause or stop the optimization task first in the Tasks tab.`
        );
        return;
      }

      // Show confirmation dialog
      const confirmed = await confirm(
        `Are you sure you want to remove this folder from your library?\n\n${folder}\n\nThis will delete all cached files and thumbnails for this folder.`,
        { title: 'Remove Library Folder', kind: 'warning' }
      );

      console.log('User confirmation:', confirmed);

      if (!confirmed) {
        console.log('User cancelled removal');
        return;
      }

      console.log('Proceeding with removal...');

      // Remove from config
      const updatedConfig = await invoke<Config>('remove_library_folder', {
        folder,
      });
      console.log('Config updated:', updatedConfig);
      updateConfig(updatedConfig);

      // Unregister from database (will delete cached files)
      await invoke('unregister_library_folder', {
        folderPath: folder,
      });
      console.log('Unregistered from database');

      // Remove media files from the UI
      removeMediaFromFolder(folder);
      console.log('Media files removed from UI');

      // Reload cache stats
      loadCacheStats();
    } catch (error) {
      console.error('Failed to remove folder:', error);
      alert(`Failed to remove folder: ${error}`);
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
        updateConfig(updatedConfig);
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

  const tabs = [
    { id: 'library' as const, label: 'Library', icon: '📁' },
    { id: 'tasks' as const, label: 'Tasks', icon: '⚙️' },
    { id: 'optimization' as const, label: 'Optimization', icon: '🎨' },
    { id: 'about' as const, label: 'About', icon: 'ℹ️' },
  ];

  const completedJobs = optimizationJobs.filter(j => j.status === 'completed').length;
  const failedJobs = optimizationJobs.filter(j => j.status === 'failed').length;
  const processingJobs = optimizationJobs.filter(j => j.status === 'processing').length;

  return (
    <div className="flex-1 overflow-auto">
      <div className="max-w-6xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-6">Settings</h1>

        {/* Tabs */}
        <div className="border-b border-gray-700 mb-6">
          <nav className="flex gap-4">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`pb-3 px-2 border-b-2 transition-colors ${
                  activeTab === tab.id
                    ? 'border-blue-500 text-white'
                    : 'border-transparent text-gray-400 hover:text-gray-300'
                }`}
              >
                <span className="mr-2">{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Library Tab */}
        {activeTab === 'library' && (
          <div className="space-y-6">
            <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">LIBRARY FOLDERS</h2>

          {config && config.library_folders.length > 0 ? (
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

          <div className="flex gap-3">
            <button
              onClick={handleAddFolder}
              disabled={isOptimizing}
              className="bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
            >
              Add Folder
            </button>

            <button
              onClick={handleLoadLibrary}
              disabled={isOptimizing || !config || config.library_folders.length === 0}
              className="bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
            >
              {isOptimizing ? 'Loading...' : 'Load Library'}
            </button>
          </div>

          <div className="mt-3 text-xs text-gray-400">
            Add folders to your library, then click "Load Library" to scan and optimize all media files.
          </div>
        </section>

        {/* Cache Settings */}
        <section>
          <h2 className="text-sm font-medium text-gray-400 mb-3">CACHE SETTINGS</h2>

          <div className="bg-gray-800 rounded p-4 border border-gray-700 mb-3">
            <div className="text-xs text-gray-400 mb-1">Cache folder</div>
            <div className="text-sm text-gray-200 font-mono break-all">{config?.cache_folder || 'Not set'}</div>
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
          </div>
        )}

        {/* Tasks Tab */}
        {activeTab === 'tasks' && (
          <div className="space-y-6">
            <section>
              <h2 className="text-sm font-medium text-gray-400 mb-3">OPTIMIZATION JOBS</h2>

              {optimizationJobs.length === 0 ? (
                <div className="bg-gray-800 rounded p-4 border border-gray-700">
                  <div className="text-sm text-gray-400">No optimization jobs running</div>
                  <div className="text-xs text-gray-500 mt-1">Click "Load Library" in the Library tab to start optimization</div>
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-4 gap-4 mb-4">
                    <div className="bg-gray-800 rounded p-4 border border-gray-700">
                      <div className="text-xs text-gray-400">Total</div>
                      <div className="text-2xl font-bold">{optimizationJobs.length}</div>
                    </div>
                    <div className="bg-blue-800 rounded p-4 border border-blue-700">
                      <div className="text-xs text-gray-300">Processing</div>
                      <div className="text-2xl font-bold">{processingJobs}</div>
                    </div>
                    <div className="bg-green-800 rounded p-4 border border-green-700">
                      <div className="text-xs text-gray-300">Completed</div>
                      <div className="text-2xl font-bold">{completedJobs}</div>
                    </div>
                    <div className="bg-red-800 rounded p-4 border border-red-700">
                      <div className="text-xs text-gray-300">Failed</div>
                      <div className="text-2xl font-bold">{failedJobs}</div>
                    </div>
                  </div>

                  <div className="bg-gray-800 rounded border border-gray-700 max-h-96 overflow-auto">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-700">
                        <tr>
                          <th className="text-left p-3 text-gray-300">File</th>
                          <th className="text-left p-3 text-gray-300">Status</th>
                          <th className="text-right p-3 text-gray-300">Progress</th>
                        </tr>
                      </thead>
                      <tbody>
                        {optimizationJobs.map((job) => (
                          <tr key={job.id} className="border-t border-gray-700">
                            <td className="p-3 font-mono text-xs truncate max-w-xs" title={job.filePath}>
                              {job.filePath.split('/').pop()}
                            </td>
                            <td className="p-3">
                              <span className={`inline-flex items-center px-2 py-1 rounded text-xs ${
                                job.status === 'completed' ? 'bg-green-900 text-green-200' :
                                job.status === 'processing' ? 'bg-blue-900 text-blue-200' :
                                job.status === 'failed' ? 'bg-red-900 text-red-200' :
                                'bg-gray-700 text-gray-300'
                              }`}>
                                {job.status}
                              </span>
                            </td>
                            <td className="p-3 text-right">
                              {job.status === 'processing' && (
                                <div className="w-24 h-2 bg-gray-700 rounded-full overflow-hidden ml-auto">
                                  <div
                                    className="h-full bg-blue-500 transition-all"
                                    style={{ width: `${job.progress}%` }}
                                  />
                                </div>
                              )}
                              {job.status === 'completed' && <span className="text-green-400">✓</span>}
                              {job.status === 'failed' && <span className="text-red-400">✗</span>}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </section>
          </div>
        )}

        {/* Optimization Tab */}
        {activeTab === 'optimization' && config && (
          <div className="space-y-6">
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
                  updateConfig(newConfig);
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
                  updateConfig(newConfig);
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
          </div>
        )}

        {/* About Tab */}
        {activeTab === 'about' && (
          <div className="space-y-6">
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
        )}
      </div>
    </div>
  );
}

export default Settings;
