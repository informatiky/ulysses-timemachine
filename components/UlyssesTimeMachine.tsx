'use client';

import React, { useState } from 'react';
import { Upload, Clock, ChevronLeft, ChevronRight, FileText, Folder, GitBranch, Loader2, Terminal, X, Download, Save, Share2 } from 'lucide-react';

declare module 'react' {
  interface InputHTMLAttributes<T> extends HTMLAttributes<T> {
    webkitdirectory?: string;
    directory?: string;
  }
}

interface FileVersion {
  hash: string;
  date: Date;
  message: string;
  author: string;
  content: string;
}

interface FileHistory {
  path: string;
  versions: FileVersion[];
}

interface RepoData {
  files: FileHistory[];
  totalCommits: number;
}

interface ProcessingState {
  stage: string;
  count?: number;
  processed?: number;
  total?: number;
}

interface LogEntry {
  timestamp: Date;
  type: 'info' | 'success' | 'error' | 'warning';
  message: string;
}

export default function UlyssesTimeMachine() {
  const [repoData, setRepoData] = useState<RepoData | null>(null);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [currentVersionIndex, setCurrentVersionIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [viewMode, setViewMode] = useState<'individual' | 'timeline'>('individual');
  const [processingState, setProcessingState] = useState<ProcessingState | null>(null);
  const [processedFiles, setProcessedFiles] = useState<string[]>([]);
  const [availableFiles, setAvailableFiles] = useState<string[]>([]);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uploadedFormData, setUploadedFormData] = useState<FormData | null>(null);
  const [showFileSelection, setShowFileSelection] = useState(false);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [showLogs, setShowLogs] = useState(false);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Load session from URL on mount
  React.useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const sid = params.get('session');

    if (sid) {
      loadSession(sid);
    }
  }, []);

  const saveSession = async () => {
    if (!repoData) return;

    setIsSaving(true);
    addLog('info', 'Saving session to server...');

    try {
      const sessionData = {
        repoData,
        logs,
        savedAt: new Date().toISOString(),
      };

      const sid = sessionId || `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const response = await fetch('/api/storage/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sid, sessionData }),
      });

      if (!response.ok) {
        throw new Error('Failed to save session');
      }

      const { url } = await response.json();

      setSessionId(sid);

      // Update URL without reload
      const newUrl = new URL(window.location.href);
      newUrl.searchParams.set('session', sid);
      window.history.pushState({}, '', newUrl);

      addLog('success', `Session saved! Share this URL: ${url}`);

      // Copy to clipboard
      await navigator.clipboard.writeText(url);
      alert('Session saved! URL copied to clipboard. You can share this link with your teacher.');
    } catch (error) {
      addLog('error', `Failed to save session: ${error}`);
      alert('Failed to save session. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const loadSession = async (sid: string) => {
    setLoading(true);
    addLog('info', `Loading session ${sid}...`);

    try {
      const response = await fetch(`/api/storage/load?sessionId=${sid}`);

      if (!response.ok) {
        throw new Error('Session not found');
      }

      const { sessionData } = await response.json();

      // Convert date strings back to Date objects
      sessionData.repoData.files.forEach((file: FileHistory) => {
        file.versions.forEach((version: FileVersion) => {
          version.date = new Date(version.date);
        });
      });

      setRepoData(sessionData.repoData);
      setLogs(sessionData.logs.map((log: any) => ({
        ...log,
        timestamp: new Date(log.timestamp),
      })));
      setSessionId(sid);

      if (sessionData.repoData.files.length > 0) {
        setSelectedFile(sessionData.repoData.files[0].path);
        setCurrentVersionIndex(sessionData.repoData.files[0].versions.length - 1);
      }

      addLog('success', `Session loaded from ${sessionData.savedAt}`);
    } catch (error) {
      addLog('error', `Failed to load session: ${error}`);
      alert('Failed to load session. The link may be invalid or expired.');
    } finally {
      setLoading(false);
    }
  };

  const addLog = (type: LogEntry['type'], message: string) => {
    const entry: LogEntry = {
      timestamp: new Date(),
      type,
      message,
    };
    setLogs(prev => [...prev, entry]);
    console.log(`[${type.toUpperCase()}] ${message}`);
  };

  const handleRepoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setLogs([]);
    addLog('info', `Starting upload of ${files.length} files`);
    setLoading(true);
    setProcessingState({ stage: 'discovering', count: files.length });

    try {
      const formData = new FormData();
      for (let i = 0; i < files.length; i++) {
        formData.append('files', files[i], files[i].webkitRelativePath || files[i].name);
      }

      addLog('info', 'Discovering .ulyz files in repository...');

      // First, discover available .ulyz files
      const discoverResponse = await fetch(
        `${process.env.NEXT_PUBLIC_UPLOAD_BASE_URL || ""}/api/discover-files`,
        {
          method: "POST",
          body: formData,
        }
      );

      if (!discoverResponse.ok) {
        throw new Error('Failed to discover files');
      }

      const { files: discoveredFiles } = await discoverResponse.json();
      addLog('success', `Discovered ${discoveredFiles.length} .ulyz files`);

      setAvailableFiles(discoveredFiles);
      setSelectedFiles(new Set(discoveredFiles)); // Select all by default
      setUploadedFormData(formData);
      setShowFileSelection(true);
      setLoading(false);
    } catch (error) {
      addLog('error', `Failed to discover files: ${error}`);
      console.error('Error discovering files:', error);
      alert('Error discovering files. Please ensure you uploaded a valid git repository.');
      setLoading(false);
    }
  };

  const downloadAnalysisReport = () => {
    if (!repoData) return;

    const report = {
      generatedAt: new Date().toISOString(),
      repository: {
        totalCommits: repoData.totalCommits,
        filesAnalyzed: repoData.files.length,
        totalVersions: repoData.files.reduce((sum, f) => sum + f.versions.length, 0),
      },
      files: repoData.files.map(file => ({
        path: file.path,
        versionCount: file.versions.length,
        firstCommit: file.versions[0]?.date,
        lastCommit: file.versions[file.versions.length - 1]?.date,
        authors: [...new Set(file.versions.map(v => v.author))],
        versions: file.versions.map(v => ({
          hash: v.hash,
          date: v.date,
          author: v.author,
          message: v.message,
          contentLength: v.content.length,
          contentPreview: v.content.substring(0, 200),
        })),
      })),
      logs: logs.map(log => ({
        timestamp: log.timestamp.toISOString(),
        type: log.type,
        message: log.message,
      })),
    };

    const blob = new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ulysses-analysis-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);

    addLog('success', 'Analysis report downloaded');
  };

  const handleProcessSelected = async () => {
    if (!uploadedFormData) return;

    addLog('info', `Processing ${selectedFiles.size} selected files`);
    setLoading(true);
    setShowFileSelection(false);
    setProcessingState({ stage: 'uploading', count: selectedFiles.size });
    setProcessedFiles([]);

    try {
      // Clone the FormData by creating a new one and copying entries
      const processingFormData = new FormData();
      for (const [key, value] of uploadedFormData.entries()) {
        processingFormData.append(key, value);
      }
      processingFormData.append('selectedFiles', JSON.stringify(Array.from(selectedFiles)));

      addLog('info', 'Uploading repository data to server...');

      const response = await fetch('/api/parse-repo', {
        method: 'POST',
        body: processingFormData,
      });

      if (!response.ok) {
        throw new Error('Failed to parse repository');
      }

      // Handle streaming response
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();

      if (!reader) {
        throw new Error('No response body');
      }

      let buffer = '';
      const collectedFiles = new Map<string, FileHistory>();
      let totalCommits = 0;

      while (true) {
        const { done, value } = await reader.read();

        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            const data = JSON.parse(line.slice(6));

            if (data.type === 'progress') {
              setProcessingState(data.data);

              if (data.data.stage === 'commits') {
                addLog('info', `Found ${data.data.count} commits in history`);
              } else if (data.data.stage === 'files_found') {
                addLog('info', `Processing ${data.data.count} files`);
              } else if (data.data.stage === 'processing') {
                if (data.data.processed % 50 === 0 || data.data.processed === data.data.total) {
                  addLog('info', `Processed ${data.data.processed}/${data.data.total} commits`);
                }
              }
            } else if (data.type === 'file') {
              setProcessedFiles(prev => [...prev, data.data.path]);
              addLog('success', `Completed: ${data.data.path} (${data.data.versionCount} versions)`);
            } else if (data.type === 'complete') {
              const completeData = data.data as RepoData;

              // Convert date strings back to Date objects
              completeData.files.forEach(file => {
                file.versions.forEach(version => {
                  version.date = new Date(version.date);
                });
              });

              setRepoData(completeData);

              const totalVersions = completeData.files.reduce((sum, f) => sum + f.versions.length, 0);
              addLog('success', `Processing complete! ${completeData.files.length} files, ${totalVersions} total versions`);

              if (completeData.files.length > 0) {
                setSelectedFile(completeData.files[0].path);
                setCurrentVersionIndex(completeData.files[0].versions.length - 1);
              }
            } else if (data.type === 'error') {
              addLog('error', data.data.message);
              throw new Error(data.data.message);
            }
          }
        }
      }
    } catch (error) {
      addLog('error', `Processing failed: ${error}`);
      console.error('Error parsing repository:', error);
      alert('Error parsing repository. Please ensure you uploaded a valid git repository.');
      setLoading(false);
      setProcessingState(null);
    }
  };

  const toggleFileSelection = (file: string) => {
    setSelectedFiles(prev => {
      const newSet = new Set(prev);
      if (newSet.has(file)) {
        newSet.delete(file);
      } else {
        newSet.add(file);
      }
      return newSet;
    });
  };

  const toggleAllFiles = () => {
    if (selectedFiles.size === availableFiles.length) {
      setSelectedFiles(new Set());
    } else {
      setSelectedFiles(new Set(availableFiles));
    }
  };

  const getCurrentFile = (): FileHistory | null => {
    if (!repoData || !selectedFile) return null;
    return repoData.files.find(f => f.path === selectedFile) || null;
  };

  const getCurrentVersion = (): FileVersion | null => {
    const file = getCurrentFile();
    if (!file || currentVersionIndex < 0 || currentVersionIndex >= file.versions.length) return null;
    return file.versions[currentVersionIndex];
  };

  const navigateVersion = (delta: number) => {
    const file = getCurrentFile();
    if (!file) return;

    const newIndex = currentVersionIndex + delta;
    if (newIndex >= 0 && newIndex < file.versions.length) {
      setCurrentVersionIndex(newIndex);
    }
  };

  const getAllVersionsByDate = () => {
    if (!repoData) return [];

    const allVersions: Array<FileVersion & { filePath: string }> = [];
    repoData.files.forEach(file => {
      file.versions.forEach(version => {
        allVersions.push({ ...version, filePath: file.path });
      });
    });

    return allVersions.sort((a, b) => b.date.getTime() - a.date.getTime());
  };

  const getProcessingMessage = () => {
    if (!processingState) return '';

    switch (processingState.stage) {
      case 'uploaded':
        return `Uploaded ${processingState.count} files`;
      case 'commits':
        return `Found ${processingState.count} commits`;
      case 'files_found':
        return `Found ${processingState.count} .ulyz files`;
      case 'processing':
        return `Processing commits: ${processingState.processed}/${processingState.total}`;
      default:
        return 'Processing...';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-gray-50 to-gray-100">
      <div className="container mx-auto px-4 py-8">
        <div className="bg-white rounded-2xl shadow-xl overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 p-6 text-white">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Clock className="w-10 h-10" />
                <div>
                  <h1 className="text-3xl font-bold">Ulysses Time Machine</h1>
                  <p className="text-blue-100 text-sm">
                    {sessionId ? `Viewing shared session` : 'Navigate your document history'}
                  </p>
                </div>
              </div>
              {repoData && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={saveSession}
                    disabled={isSaving}
                    className="flex items-center gap-2 bg-indigo-500 px-4 py-2 rounded-lg hover:bg-indigo-600 transition-colors disabled:bg-gray-400"
                    title="Save and get shareable link"
                  >
                    {isSaving ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <Share2 className="w-5 h-5" />
                    )}
                    <span className="text-sm">Share</span>
                  </button>
                  <button
                    onClick={downloadAnalysisReport}
                    className="flex items-center gap-2 bg-green-500 px-4 py-2 rounded-lg hover:bg-green-600 transition-colors"
                    title="Download analysis report for teacher"
                  >
                    <Download className="w-5 h-5" />
                    <span className="text-sm">Report</span>
                  </button>
                  <button
                    onClick={() => setShowLogs(!showLogs)}
                    className="flex items-center gap-2 bg-blue-500 px-4 py-2 rounded-lg hover:bg-blue-600 transition-colors"
                  >
                    <Terminal className="w-5 h-5" />
                    <span className="text-sm">Logs</span>
                  </button>
                  <div className="flex items-center gap-2 bg-blue-500 px-4 py-2 rounded-lg">
                    <GitBranch className="w-5 h-5" />
                    <span className="text-sm">{repoData.totalCommits} commits</span>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Logs Panel */}
          {showLogs && (
            <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
              <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[80vh] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-6 h-6 text-gray-700" />
                    <h2 className="text-xl font-bold text-gray-800">Processing Logs</h2>
                  </div>
                  <button
                    onClick={() => setShowLogs(false)}
                    className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                  >
                    <X className="w-6 h-6 text-gray-600" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto p-4 bg-gray-900 font-mono text-sm">
                  {logs.length === 0 ? (
                    <div className="text-gray-500 text-center py-8">No logs yet</div>
                  ) : (
                    <div className="space-y-1">
                      {logs.map((log, idx) => (
                        <div
                          key={idx}
                          className={`${
                            log.type === 'error'
                              ? 'text-red-400'
                              : log.type === 'success'
                              ? 'text-green-400'
                              : log.type === 'warning'
                              ? 'text-yellow-400'
                              : 'text-gray-300'
                          }`}
                        >
                          <span className="text-gray-500">
                            [{log.timestamp.toLocaleTimeString()}]
                          </span>{' '}
                          <span className="font-semibold">[{log.type.toUpperCase()}]</span>{' '}
                          {log.message}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-4 border-t bg-gray-50 flex justify-between items-center">
                  <span className="text-sm text-gray-600">{logs.length} log entries</span>
                  <button
                    onClick={() => {
                      const logText = logs
                        .map(
                          log =>
                            `[${log.timestamp.toISOString()}] [${log.type.toUpperCase()}] ${log.message}`
                        )
                        .join('\n');
                      navigator.clipboard.writeText(logText);
                      alert('Logs copied to clipboard');
                    }}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    Copy Logs
                  </button>
                </div>
              </div>
            </div>
          )}

          <div className="p-6">
            {showFileSelection ? (
              <div className="space-y-6">
                <div className="border-2 border-blue-200 rounded-xl p-6 bg-blue-50">
                  <h2 className="text-2xl font-bold text-gray-800 mb-2">Select Files to Process</h2>
                  <p className="text-gray-600 mb-4">
                    Choose which .ulyz files you want to include in the time machine.
                    Processing only selected files will be much faster.
                  </p>

                  <div className="flex items-center justify-between mb-4 p-3 bg-white rounded-lg">
                    <span className="text-sm font-semibold text-gray-700">
                      {selectedFiles.size} of {availableFiles.length} files selected
                    </span>
                    <button
                      onClick={toggleAllFiles}
                      className="px-4 py-2 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
                    >
                      {selectedFiles.size === availableFiles.length ? 'Deselect All' : 'Select All'}
                    </button>
                  </div>

                  <div className="bg-white rounded-lg p-4 max-h-96 overflow-y-auto space-y-2">
                    {availableFiles.map((file) => (
                      <label
                        key={file}
                        className="flex items-center gap-3 p-3 hover:bg-gray-50 rounded-lg cursor-pointer transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={selectedFiles.has(file)}
                          onChange={() => toggleFileSelection(file)}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
                        />
                        <FileText className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span className="text-sm text-gray-700 flex-1">{file}</span>
                      </label>
                    ))}
                  </div>

                  <div className="flex gap-3 mt-6">
                    <button
                      onClick={handleProcessSelected}
                      disabled={selectedFiles.size === 0}
                      className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-xl hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5"
                    >
                      Process {selectedFiles.size} Selected File{selectedFiles.size !== 1 ? 's' : ''}
                    </button>
                    <button
                      onClick={() => {
                        setShowFileSelection(false);
                        setUploadedFormData(null);
                        setAvailableFiles([]);
                        setSelectedFiles(new Set());
                      }}
                      className="px-6 py-3 bg-gray-100 text-gray-700 rounded-xl hover:bg-gray-200 transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              </div>
            ) : !repoData ? (
              <div className="border-2 border-dashed border-gray-300 rounded-xl p-16 text-center">
                <Upload className="w-20 h-20 mx-auto text-gray-400 mb-6" />
                <label className="cursor-pointer">
                  <div className="mb-4">
                    <p className="text-xl text-gray-700 font-semibold mb-2">
                      Upload Your Git Repository
                    </p>
                    <p className="text-sm text-gray-500 mb-6">
                      Select the entire folder containing your .git directory
                    </p>
                  </div>
                  <input
                    type="file"
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleRepoUpload}
                    className="hidden"
                    disabled={loading}
                  />
                  <span className="inline-block bg-blue-600 text-white px-8 py-4 rounded-xl hover:bg-blue-700 transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5">
                    {loading ? 'Processing...' : 'Choose Folder'}
                  </span>
                </label>

                {loading && processingState && (
                  <div className="mt-8 space-y-4">
                    <div className="flex items-center justify-center gap-3">
                      <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
                      <p className="text-gray-700 font-medium">{getProcessingMessage()}</p>
                    </div>

                    <button
                      onClick={() => setShowLogs(true)}
                      className="mx-auto flex items-center gap-2 px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 transition-colors text-sm"
                    >
                      <Terminal className="w-4 h-4" />
                      View Logs
                    </button>

                    {processingState.stage === 'processing' && processingState.total && (
                      <div className="max-w-md mx-auto">
                        <div className="bg-gray-200 rounded-full h-2 overflow-hidden">
                          <div
                            className="bg-blue-600 h-full transition-all duration-300"
                            style={{
                              width: `${((processingState.processed || 0) / processingState.total) * 100}%`,
                            }}
                          />
                        </div>
                      </div>
                    )}

                    {processedFiles.length > 0 && (
                      <div className="mt-4 max-w-md mx-auto">
                        <p className="text-sm text-gray-600 mb-2">Processed {processedFiles.length} files:</p>
                        <div className="bg-gray-50 rounded-lg p-3 max-h-40 overflow-y-auto text-left">
                          {processedFiles.slice(-5).map((file, idx) => (
                            <div key={idx} className="text-xs text-gray-600 truncate">
                              ✓ {file}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="space-y-6">
                <div className="flex gap-2 bg-gray-100 p-1 rounded-lg w-fit">
                  <button
                    onClick={() => setViewMode('individual')}
                    className={`px-4 py-2 rounded-md transition-all ${
                      viewMode === 'individual'
                        ? 'bg-white shadow text-blue-600 font-semibold'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Individual Files
                  </button>
                  <button
                    onClick={() => setViewMode('timeline')}
                    className={`px-4 py-2 rounded-md transition-all ${
                      viewMode === 'timeline'
                        ? 'bg-white shadow text-blue-600 font-semibold'
                        : 'text-gray-600 hover:text-gray-900'
                    }`}
                  >
                    Combined Timeline
                  </button>
                </div>

                {viewMode === 'individual' ? (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div className="bg-gray-50 rounded-xl p-4">
                      <h2 className="text-lg font-semibold text-gray-800 mb-4 flex items-center gap-2">
                        <Folder className="w-5 h-5" />
                        Files ({repoData.files.length})
                      </h2>
                      <div className="space-y-2 max-h-96 overflow-y-auto">
                        {repoData.files.map((file) => (
                          <button
                            key={file.path}
                            onClick={() => {
                              setSelectedFile(file.path);
                              setCurrentVersionIndex(file.versions.length - 1);
                            }}
                            className={`w-full text-left px-3 py-2 rounded-lg transition-all ${
                              selectedFile === file.path
                                ? 'bg-blue-600 text-white shadow-md'
                                : 'bg-white hover:bg-gray-100 text-gray-700'
                            }`}
                          >
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 flex-shrink-0" />
                              <span className="text-sm truncate">{file.path}</span>
                            </div>
                            <span className="text-xs opacity-75 ml-6">
                              {file.versions.length} versions
                            </span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="md:col-span-2 space-y-4">
                      {getCurrentFile() && (
                        <>
                          <div className="bg-gray-50 rounded-xl p-4">
                            <div className="flex items-center justify-between mb-4">
                              <button
                                onClick={() => navigateVersion(-1)}
                                disabled={currentVersionIndex === 0}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                              >
                                <ChevronLeft className="w-5 h-5" />
                                Older
                              </button>

                              <div className="text-center">
                                <div className="text-sm font-semibold text-gray-700">
                                  Version {currentVersionIndex + 1} of {getCurrentFile()!.versions.length}
                                </div>
                                {getCurrentVersion() && (
                                  <div className="text-xs text-gray-500 mt-1">
                                    {new Date(getCurrentVersion()!.date).toLocaleString()}
                                  </div>
                                )}
                              </div>

                              <button
                                onClick={() => navigateVersion(1)}
                                disabled={currentVersionIndex === getCurrentFile()!.versions.length - 1}
                                className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg disabled:bg-gray-300 disabled:cursor-not-allowed hover:bg-blue-700 transition-colors"
                              >
                                Newer
                                <ChevronRight className="w-5 h-5" />
                              </button>
                            </div>

                            <input
                              type="range"
                              min="0"
                              max={getCurrentFile()!.versions.length - 1}
                              value={currentVersionIndex}
                              onChange={(e) => setCurrentVersionIndex(parseInt(e.target.value))}
                              className="w-full"
                            />
                          </div>

                          {getCurrentVersion() && (
                            <>
                              <div className="bg-blue-50 border border-blue-200 rounded-xl p-4">
                                <div className="text-sm space-y-1">
                                  <div><span className="font-semibold">Commit:</span> {getCurrentVersion()!.hash.substring(0, 8)}</div>
                                  <div><span className="font-semibold">Author:</span> {getCurrentVersion()!.author}</div>
                                  <div><span className="font-semibold">Message:</span> {getCurrentVersion()!.message}</div>
                                </div>
                              </div>

                              <div className="bg-white border border-gray-200 rounded-xl p-6">
                                <pre className="whitespace-pre-wrap text-sm font-mono text-gray-800 max-h-96 overflow-y-auto">
                                  {getCurrentVersion()!.content}
                                </pre>
                              </div>
                            </>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <h2 className="text-xl font-semibold text-gray-800">
                      All Changes Timeline
                    </h2>
                    <div className="space-y-3 max-h-[600px] overflow-y-auto">
                      {getAllVersionsByDate().map((version, index) => (
                        <div
                          key={`${version.filePath}-${version.hash}-${index}`}
                          className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow"
                        >
                          <div className="flex items-start justify-between mb-2">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <FileText className="w-4 h-4 text-blue-600" />
                                <span className="font-semibold text-gray-800">{version.filePath}</span>
                              </div>
                              <div className="text-sm text-gray-600">
                                {version.message}
                              </div>
                            </div>
                            <div className="text-xs text-gray-500 text-right">
                              <div>{new Date(version.date).toLocaleDateString()}</div>
                              <div>{new Date(version.date).toLocaleTimeString()}</div>
                            </div>
                          </div>
                          <div className="text-xs text-gray-500 mb-2">
                            {version.author} • {version.hash.substring(0, 8)}
                          </div>
                          <details className="text-sm">
                            <summary className="cursor-pointer text-blue-600 hover:text-blue-700">
                              View content
                            </summary>
                            <pre className="mt-2 bg-gray-50 p-3 rounded text-xs font-mono overflow-x-auto">
                              {version.content}
                            </pre>
                          </details>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}