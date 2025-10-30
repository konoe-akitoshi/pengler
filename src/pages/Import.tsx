import { useState, useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { open } from '@tauri-apps/plugin-dialog';
import { convertFileSrc } from '@tauri-apps/api/core';
import { ImportCandidate, ImportSelection } from '../types/import';
import { useConfigStore } from '../stores/configStore';

function Import() {
  const [candidates, setCandidates] = useState<ImportCandidate[]>([]);
  const [selection, setSelection] = useState<ImportSelection>({});
  const [isScanning, setIsScanning] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [sourcePath, setSourcePath] = useState<string>('');
  const [destinationFolder, setDestinationFolder] = useState<string>('');
  const [removableDrives, setRemovableDrives] = useState<string[]>([]);
  const { config, loadConfig } = useConfigStore();

  useEffect(() => {
    loadConfig();
    detectRemovableDrives();
  }, [loadConfig]);

  useEffect(() => {
    // Set default destination to first library folder
    if (config && config.library_folders.length > 0 && !destinationFolder) {
      setDestinationFolder(config.library_folders[0]);
    }
  }, [config, destinationFolder]);

  useEffect(() => {
    // Listen for SD card insertion events when on Import page
    const unlistenInserted = listen<string>('sd-card-inserted', async (event) => {
      const drivePath = event.payload;
      console.log('SD card inserted on Import page:', drivePath);

      // Update removable drives list
      await detectRemovableDrives();

      // Auto-scan the newly inserted drive
      setSourcePath(drivePath);
      await scanSource(drivePath);
    });

    const unlistenRemoved = listen<string>('sd-card-removed', async (event) => {
      console.log('SD card removed:', event.payload);
      // Refresh the drives list
      await detectRemovableDrives();
    });

    return () => {
      unlistenInserted.then(fn => fn());
      unlistenRemoved.then(fn => fn());
    };
  }, []);

  const detectRemovableDrives = async () => {
    try {
      const drives = await invoke<string[]>('detect_removable_drives');
      setRemovableDrives(drives);
      console.log('Detected removable drives:', drives);
    } catch (error) {
      console.error('Failed to detect removable drives:', error);
    }
  };

  const handleSelectSource = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Import Source Folder',
      });

      if (selected && typeof selected === 'string') {
        setSourcePath(selected);
        await scanSource(selected);
      }
    } catch (error) {
      console.error('Failed to select source:', error);
      alert(`Failed to select source: ${error}`);
    }
  };

  const handleSelectRemovableDrive = async (drive: string) => {
    setSourcePath(drive);
    await scanSource(drive);
  };

  const scanSource = async (path: string) => {
    setIsScanning(true);
    try {
      const scanned = await invoke<ImportCandidate[]>('scan_import_source', {
        sourcePath: path,
      });

      setCandidates(scanned);

      // Auto-select non-duplicates
      const newSelection: ImportSelection = {};
      scanned.forEach(candidate => {
        newSelection[candidate.file_path] = !candidate.is_duplicate;
      });
      setSelection(newSelection);

      console.log(`Scanned ${scanned.length} candidates, ${scanned.filter(c => !c.is_duplicate).length} new files`);
    } catch (error) {
      console.error('Failed to scan source:', error);
      alert(`Failed to scan source: ${error}`);
    } finally {
      setIsScanning(false);
    }
  };

  const handleSelectDestination = async () => {
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: 'Select Destination Folder',
      });

      if (selected && typeof selected === 'string') {
        setDestinationFolder(selected);
      }
    } catch (error) {
      console.error('Failed to select destination:', error);
      alert(`Failed to select destination: ${error}`);
    }
  };

  const toggleSelection = (filePath: string) => {
    setSelection(prev => ({
      ...prev,
      [filePath]: !prev[filePath],
    }));
  };

  const toggleAll = () => {
    const allSelected = candidates.every(c => selection[c.file_path]);
    const newSelection: ImportSelection = {};
    candidates.forEach(candidate => {
      newSelection[candidate.file_path] = !allSelected;
    });
    setSelection(newSelection);
  };

  const handleImport = async () => {
    if (!destinationFolder) {
      alert('Please select a destination folder');
      return;
    }

    const selectedFiles = candidates
      .filter(c => selection[c.file_path])
      .map(c => c.file_path);

    if (selectedFiles.length === 0) {
      alert('No files selected for import');
      return;
    }

    const confirmed = window.confirm(
      `Import ${selectedFiles.length} file(s) to ${destinationFolder}?`
    );

    if (!confirmed) return;

    setIsImporting(true);
    try {
      const imported = await invoke<string[]>('import_files', {
        files: selectedFiles,
        destinationFolder,
      });

      alert(`Successfully imported ${imported.length} file(s)`);

      // Clear selection and candidates
      setCandidates([]);
      setSelection({});
      setSourcePath('');
    } catch (error) {
      console.error('Failed to import files:', error);
      alert(`Failed to import files: ${error}`);
    } finally {
      setIsImporting(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const selectedCount = candidates.filter(c => selection[c.file_path]).length;
  const newFilesCount = candidates.filter(c => !c.is_duplicate).length;
  const duplicatesCount = candidates.filter(c => c.is_duplicate).length;

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-gray-800 px-8 py-6">
        <h1 className="text-2xl font-semibold">Import Photos</h1>
        <p className="text-sm text-gray-400 mt-1">
          Import photos from SD cards or folders
        </p>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-auto px-8 py-6">
        {/* Source Selection */}
        <div className="mb-6">
          <h2 className="text-lg font-medium mb-3">Source</h2>

          {/* Removable Drives */}
          {removableDrives.length > 0 && (
            <div className="mb-4">
              <div className="text-sm text-gray-400 mb-2">Detected SD Cards/Cameras:</div>
              <div className="flex gap-2 flex-wrap">
                {removableDrives.map(drive => (
                  <button
                    key={drive}
                    onClick={() => handleSelectRemovableDrive(drive)}
                    className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded transition-colors"
                  >
                    📷 {drive}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Manual Selection */}
          <div className="flex gap-3">
            <button
              onClick={handleSelectSource}
              disabled={isScanning}
              className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
            >
              Select Folder...
            </button>
            {sourcePath && (
              <div className="flex items-center text-sm text-gray-300">
                <span className="font-mono">{sourcePath}</span>
              </div>
            )}
          </div>
        </div>

        {/* Destination Selection */}
        {candidates.length > 0 && (
          <div className="mb-6">
            <h2 className="text-lg font-medium mb-3">Destination</h2>
            <div className="flex gap-3">
              <button
                onClick={handleSelectDestination}
                disabled={isImporting}
                className="bg-gray-700 hover:bg-gray-600 text-white px-4 py-2 rounded transition-colors disabled:opacity-50"
              >
                Select Destination...
              </button>
              {destinationFolder && (
                <div className="flex items-center text-sm text-gray-300">
                  <span className="font-mono">{destinationFolder}</span>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Scanning Status */}
        {isScanning && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center">
              <div className="text-lg mb-2">Scanning...</div>
              <div className="text-sm text-gray-400">Analyzing files and checking for duplicates</div>
            </div>
          </div>
        )}

        {/* Candidates List */}
        {!isScanning && candidates.length > 0 && (
          <div>
            {/* Stats */}
            <div className="mb-4 flex items-center justify-between">
              <div className="flex gap-6 text-sm">
                <span className="text-gray-300">
                  Total: <span className="font-medium text-white">{candidates.length}</span>
                </span>
                <span className="text-green-400">
                  New: <span className="font-medium">{newFilesCount}</span>
                </span>
                <span className="text-yellow-400">
                  Duplicates: <span className="font-medium">{duplicatesCount}</span>
                </span>
                <span className="text-blue-400">
                  Selected: <span className="font-medium">{selectedCount}</span>
                </span>
              </div>
              <button
                onClick={toggleAll}
                className="text-sm text-blue-400 hover:text-blue-300"
              >
                {candidates.every(c => selection[c.file_path]) ? 'Deselect All' : 'Select All'}
              </button>
            </div>

            {/* File Grid */}
            <div className="grid grid-cols-4 gap-4">
              {candidates.map(candidate => {
                const isSelected = selection[candidate.file_path];
                const isDuplicate = candidate.is_duplicate;

                return (
                  <div
                    key={candidate.file_path}
                    className={`relative border-2 rounded overflow-hidden cursor-pointer transition-all ${
                      isSelected
                        ? 'border-blue-500'
                        : isDuplicate
                        ? 'border-yellow-600'
                        : 'border-gray-700'
                    }`}
                    onClick={() => toggleSelection(candidate.file_path)}
                  >
                    {/* Thumbnail */}
                    <div className="aspect-square bg-gray-800 flex items-center justify-center">
                      {candidate.media_type === 'image' ? (
                        <img
                          src={convertFileSrc(candidate.file_path)}
                          alt={candidate.file_name}
                          className="w-full h-full object-cover"
                        />
                      ) : (
                        <div className="text-4xl">🎬</div>
                      )}
                    </div>

                    {/* Info */}
                    <div className="p-2 bg-gray-900">
                      <div className="text-xs font-mono truncate">{candidate.file_name}</div>
                      <div className="text-xs text-gray-400">{formatFileSize(candidate.file_size)}</div>
                    </div>

                    {/* Checkbox */}
                    <div className="absolute top-2 left-2">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => {}}
                        className="w-5 h-5"
                      />
                    </div>

                    {/* Duplicate Badge */}
                    {isDuplicate && (
                      <div className="absolute top-2 right-2 bg-yellow-600 text-white text-xs px-2 py-1 rounded">
                        Duplicate
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Import Button */}
            <div className="mt-6 flex justify-end">
              <button
                onClick={handleImport}
                disabled={isImporting || selectedCount === 0 || !destinationFolder}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded text-lg font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isImporting ? 'Importing...' : `Import ${selectedCount} File(s)`}
              </button>
            </div>
          </div>
        )}

        {/* Empty State */}
        {!isScanning && candidates.length === 0 && sourcePath === '' && (
          <div className="flex items-center justify-center py-12">
            <div className="text-center text-gray-400">
              <div className="text-6xl mb-4">📸</div>
              <div className="text-xl mb-2">No source selected</div>
              <div className="text-sm">Select an SD card or folder to start importing</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Import;
