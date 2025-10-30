import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { useConfigStore } from '../stores/configStore';

interface TaskInfo {
  folder_path: string;
  total_files: number;
  processed_files: number;
  optimized_files: number;
  failed_files: number;
  status: 'running' | 'paused' | 'stopped' | 'completed';
}

interface Config {
  library_folders: string[];
  cache_folder: string;
  max_resolution: number;
  optimization_quality: number;
}

interface MediaFile {
  id: number;
  filePath: string;
  fileHash: string;
  mediaType: string;
  takenAt: string | null;
  modifiedAt: string;
  thumbnailPath: string | null;
}

function Tasks() {
  const [tasks, setTasks] = useState<TaskInfo[]>([]);
  const { config, loadConfig } = useConfigStore();

  const loadTasks = async () => {
    try {
      const allTasks = await invoke<TaskInfo[]>('get_all_tasks');
      setTasks(allTasks);
    } catch (error) {
      console.error('Failed to load tasks:', error);
    }
  };

  useEffect(() => {
    loadConfig();
    loadTasks();

    // Poll for updates every 500ms for more responsive UI
    const interval = setInterval(loadTasks, 500);
    return () => clearInterval(interval);
  }, [loadConfig]);

  const handlePause = async (folderPath: string) => {
    try {
      await invoke('pause_task', { folderPath });
      await loadTasks();
    } catch (error) {
      console.error('Failed to pause task:', error);
      alert(`Failed to pause task: ${error}`);
    }
  };

  const handleResume = async (folderPath: string) => {
    try {
      await invoke('resume_task', { folderPath });
      await loadTasks();
    } catch (error) {
      console.error('Failed to resume task:', error);
      alert(`Failed to resume task: ${error}`);
    }
  };

  const handleStop = async (folderPath: string) => {
    const confirmed = window.confirm(
      `Are you sure you want to stop this optimization task?\n\nFolder: ${folderPath}\n\nThis will cancel all remaining optimization jobs for this folder.`
    );

    if (!confirmed) return;

    try {
      await invoke('stop_task', { folderPath });
      await loadTasks();
    } catch (error) {
      console.error('Failed to stop task:', error);
      alert(`Failed to stop task: ${error}`);
    }
  };

  const handleRemove = async (folderPath: string) => {
    try {
      await invoke('remove_optimization_task', { folderPath });
      await loadTasks();
    } catch (error) {
      console.error('Failed to remove task:', error);
      alert(`Failed to remove task: ${error}`);
    }
  };

  const handleRegenerate = async (folderPath: string) => {
    try {
      // Clear existing cache for this folder
      console.log('Clearing cache for folder:', folderPath);
      await invoke('clear_folder_cache', { folderPath });

      // Scan folder for media files
      console.log('Scanning folder:', folderPath);
      const files = await invoke<MediaFile[]>('scan_folder', { path: folderPath });
      console.log(`Found ${files.length} files to optimize`);

      // Reset existing task instead of removing and creating new one
      await invoke('reset_optimization_task', {
        folderPath,
        totalFiles: files.length,
      });

      // Start optimization for all files (with small delay to avoid overwhelming the system)
      console.log('Starting background optimization...');
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Don't await - let them run in background
        invoke('optimize_media_file', {
          folderPath,
          filePath: file.filePath,
          fileHash: file.fileHash,
          mediaType: file.mediaType,
        }).catch((error) => {
          console.error(`Failed to optimize ${file.filePath}:`, error);
        });

        // Small delay every 10 files to prevent overwhelming
        if (i > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('Background optimization started');
      await loadTasks();
    } catch (error) {
      console.error('Failed to regenerate:', error);
      alert(`Failed to regenerate: ${error}`);
    }
  };

  const handleRetryFailed = async (folderPath: string) => {
    try {
      // Get all media files from this folder
      console.log('Scanning folder for failed files:', folderPath);
      const files = await invoke<MediaFile[]>('scan_folder', { path: folderPath });

      // Filter to only files that don't have cached versions
      const failedFiles: MediaFile[] = [];
      for (const file of files) {
        const cachedPath = await invoke<string | null>('get_cached_file_path', {
          fileHash: file.fileHash,
        });
        if (!cachedPath) {
          failedFiles.push(file);
        }
      }

      console.log(`Found ${failedFiles.length} failed files out of ${files.length} total`);

      if (failedFiles.length === 0) {
        alert('No failed files to retry. All files have been optimized successfully.');
        return;
      }

      // Reset task for failed files only (don't remove to avoid UI flicker)
      await invoke('reset_optimization_task', {
        folderPath,
        totalFiles: failedFiles.length,
      });

      // Retry only failed files (with small delay to avoid overwhelming the system)
      console.log(`Starting retry for ${failedFiles.length} failed files...`);
      for (let i = 0; i < failedFiles.length; i++) {
        const file = failedFiles[i];
        // Don't await - let them run in background
        invoke('optimize_media_file', {
          folderPath,
          filePath: file.filePath,
          fileHash: file.fileHash,
          mediaType: file.mediaType,
        }).catch((error) => {
          console.error(`Failed to optimize ${file.filePath}:`, error);
        });

        // Small delay every 10 files to prevent overwhelming
        if (i > 0 && i % 10 === 0) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      }

      console.log('Retry started for failed files');
      await loadTasks();
    } catch (error) {
      console.error('Failed to retry failed files:', error);
      alert(`Failed to retry failed files: ${error}`);
    }
  };

  const getStatusColor = (status: TaskInfo['status']) => {
    switch (status) {
      case 'running':
        return 'text-green-400';
      case 'paused':
        return 'text-yellow-400';
      case 'stopped':
        return 'text-red-400';
      case 'completed':
        return 'text-blue-400';
      default:
        return 'text-gray-400';
    }
  };

  const getStatusIcon = (status: TaskInfo['status']) => {
    switch (status) {
      case 'running':
        return '▶';
      case 'paused':
        return '⏸';
      case 'stopped':
        return '⏹';
      case 'completed':
        return '✓';
      default:
        return '?';
    }
  };

  const formatProgress = (task: TaskInfo) => {
    const percentage = task.total_files > 0
      ? Math.round((task.processed_files / task.total_files) * 100)
      : 0;
    return `${percentage}%`;
  };

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <div className="flex-shrink-0 border-b border-gray-800 px-8 py-6">
        <h1 className="text-2xl font-semibold">Optimization Tasks</h1>
        <p className="text-sm text-gray-400 mt-1">
          Manage ongoing optimization tasks for your library folders
        </p>
      </div>

      <div className="flex-1 overflow-auto px-8 py-6">
        {!config || config.library_folders.length === 0 ? (
          <div className="bg-gray-800 rounded p-8 border border-gray-700 text-center">
            <div className="text-gray-400">No library folders configured</div>
            <div className="text-sm text-gray-500 mt-2">
              Add library folders in Settings to see optimization tasks
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {config.library_folders.map((folderPath) => {
              const task = tasks.find(t => t.folder_path === folderPath);

              if (!task) {
                // No task exists for this folder - show generate button
                return (
                  <div
                    key={folderPath}
                    className="bg-gray-800 rounded p-6 border border-gray-700"
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-300 font-mono truncate mb-3">
                          {folderPath}
                        </div>
                        <div className="text-sm text-gray-400 mb-4">
                          No optimization task exists for this folder yet.
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={async () => {
                        try {
                          // Scan folder for media files
                          const files = await invoke<MediaFile[]>('scan_folder', { path: folderPath });

                          if (files.length === 0) {
                            alert('No media files found in this folder.');
                            return;
                          }

                          // Create new task
                          await invoke('create_optimization_task', {
                            folderPath,
                            totalFiles: files.length,
                          });

                          // Start optimization for all files
                          for (let i = 0; i < files.length; i++) {
                            const file = files[i];
                            invoke('optimize_media_file', {
                              folderPath,
                              filePath: file.filePath,
                              fileHash: file.fileHash,
                              mediaType: file.mediaType,
                            }).catch((error) => {
                              console.error(`Failed to optimize ${file.filePath}:`, error);
                            });

                            // Small delay every 10 files to prevent overwhelming
                            if (i > 0 && i % 10 === 0) {
                              await new Promise(resolve => setTimeout(resolve, 100));
                            }
                          }

                          await loadTasks();
                        } catch (error) {
                          console.error('Failed to generate task:', error);
                          alert(`Failed to generate task: ${error}`);
                        }
                      }}
                      className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-2 px-4 rounded transition-colors"
                    >
                      🔄 Generate Optimization Task
                    </button>
                  </div>
                );
              }

              return (
              <div
                key={task.folder_path}
                className="bg-gray-800 rounded p-6 border border-gray-700"
              >
                {/* Header */}
                <div className="flex items-start justify-between mb-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-lg ${getStatusColor(task.status)}`}>
                        {getStatusIcon(task.status)}
                      </span>
                      <span className={`text-sm font-medium uppercase ${getStatusColor(task.status)}`}>
                        {task.status}
                      </span>
                    </div>
                    <div className="text-sm text-gray-300 font-mono truncate">
                      {task.folder_path}
                    </div>
                  </div>

                  {/* Controls */}
                  <div className="flex gap-2 ml-4">
                    {task.status === 'running' && (
                      <button
                        onClick={() => handlePause(task.folder_path)}
                        className="bg-yellow-600 hover:bg-yellow-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                        title="Pause"
                      >
                        ⏸ Pause
                      </button>
                    )}
                    {task.status === 'paused' && (
                      <button
                        onClick={() => handleResume(task.folder_path)}
                        className="bg-green-600 hover:bg-green-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                        title="Resume"
                      >
                        ▶ Resume
                      </button>
                    )}
                    {(task.status === 'running' || task.status === 'paused') && (
                      <button
                        onClick={() => handleStop(task.folder_path)}
                        className="bg-red-600 hover:bg-red-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                        title="Stop"
                      >
                        ⏹ Stop
                      </button>
                    )}
                    {task.status === 'completed' && (
                      <>
                        <button
                          onClick={() => handleRegenerate(task.folder_path)}
                          className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                          title="Regenerate all files"
                        >
                          🔄 Regenerate
                        </button>
                        {task.failed_files > 0 && (
                          <button
                            onClick={() => handleRetryFailed(task.folder_path)}
                            className="bg-orange-600 hover:bg-orange-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                            title="Retry failed files only"
                          >
                            ⚠ Retry Failed ({task.failed_files})
                          </button>
                        )}
                        <button
                          onClick={() => handleRemove(task.folder_path)}
                          className="bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                          title="Remove"
                        >
                          ✕ Remove
                        </button>
                      </>
                    )}
                    {task.status === 'stopped' && (
                      <button
                        onClick={() => handleRemove(task.folder_path)}
                        className="bg-gray-600 hover:bg-gray-700 text-white text-sm font-medium py-1.5 px-3 rounded transition-colors"
                        title="Remove"
                      >
                        ✕ Remove
                      </button>
                    )}
                  </div>
                </div>

                {/* Progress Bar */}
                <div className="mb-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Progress</span>
                    <span>{formatProgress(task)}</span>
                  </div>
                  <div className="w-full bg-gray-700 rounded-full h-2 overflow-hidden">
                    <div
                      className={`h-full transition-all duration-300 ${
                        task.status === 'running'
                          ? 'bg-green-500'
                          : task.status === 'paused'
                          ? 'bg-yellow-500'
                          : task.status === 'completed'
                          ? 'bg-blue-500'
                          : 'bg-red-500'
                      }`}
                      style={{
                        width: formatProgress(task),
                      }}
                    />
                  </div>
                </div>

                {/* Stats */}
                <div className="grid grid-cols-4 gap-4 text-sm">
                  <div>
                    <div className="text-gray-400">Total Files</div>
                    <div className="text-white font-medium">{task.total_files.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Processed</div>
                    <div className="text-white font-medium">{task.processed_files.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Optimized</div>
                    <div className="text-green-400 font-medium">{task.optimized_files.toLocaleString()}</div>
                  </div>
                  <div>
                    <div className="text-gray-400">Failed</div>
                    <div className="text-red-400 font-medium">{task.failed_files.toLocaleString()}</div>
                  </div>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Tasks;
