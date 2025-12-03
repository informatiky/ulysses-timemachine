import git from 'isomorphic-git';
import { parseUlyzContent } from './ulyz-parser';
import fs from 'fs';
import path from 'path';
import { mkdir, writeFile, rm } from 'fs/promises';

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

interface StreamCallback {
  (data: { type: 'progress' | 'file' | 'complete'; data: any }): void;
}

function shouldIgnorePath(filepath: string): boolean {
  const ignoredDirs = ['Archive', 'Private', '.automation'];
  for (const dir of ignoredDirs) {
    if (filepath.includes(`/${dir}/`) || filepath.startsWith(`${dir}/`)) {
      return true;
    }
  }
  return false;
}

async function getAllFiles(dir: string): Promise<string[]> {
  const files: string[] = [];
  const { readdir } = await import('fs/promises');

  try {
    const entries = await readdir(dir, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        const subFiles = await getAllFiles(fullPath);
        files.push(...subFiles);
      } else {
        files.push(fullPath);
      }
    }
  } catch {
    // Skip inaccessible directories
  }

  return files;
}

export async function parseGitRepo(
  uploadedFiles: File[],
  onProgress?: StreamCallback,
  selectedFilesFilter?: string[]
): Promise<RepoData> {
  console.log(`Starting optimized repo parse with ${uploadedFiles.length} files`);

  const tmpDir = path.join(process.cwd(), '.tmp', `repo-${Date.now()}`);
  await mkdir(tmpDir, { recursive: true });

  let ignoredCount = 0;
  let includedCount = 0;

  try {
    // Write all files to temp directory
    for (const file of uploadedFiles) {
      const filepath = (file as any).webkitRelativePath || file.name;

      if (shouldIgnorePath(filepath)) {
        ignoredCount++;
        continue;
      }

      const buffer = await file.arrayBuffer();
      const data = Buffer.from(buffer);

      const fullPath = path.join(tmpDir, filepath);
      const dirPath = path.dirname(fullPath);

      await mkdir(dirPath, { recursive: true });
      await writeFile(fullPath, data);
      includedCount++;
    }

    console.log(`Files written: ${includedCount}, ignored: ${ignoredCount}`);
    onProgress?.({ type: 'progress', data: { stage: 'uploaded', count: includedCount } });

    // Find root directory
    const allFiles = await getAllFiles(tmpDir);
    const gitPaths = allFiles.filter(p => p.includes('.git'));

    if (gitPaths.length === 0) {
      throw new Error('No .git directory found');
    }

    const firstGitPath = gitPaths[0];
    const relativeGitPath = path.relative(tmpDir, firstGitPath);
    const rootDir = path.join(tmpDir, relativeGitPath.split('.git')[0]);

    console.log('Root directory:', rootDir);

    // Get all commits
    const commits = await git.log({
      fs,
      dir: rootDir,
      depth: 10000, // Increased for full history
    });

    console.log(`Found ${commits.length} commits`);
    onProgress?.({ type: 'progress', data: { stage: 'commits', count: commits.length } });

    // Find all .ulyz files from the latest commit
    const latestCommit = commits[0];
    const { tree } = await git.readTree({
      fs,
      dir: rootDir,
      oid: latestCommit.oid,
    });

    const ulyzFiles: string[] = [];

    async function findUlyzFiles(treeOid: string, prefix: string = '') {
      const { tree } = await git.readTree({
        fs,
        dir: rootDir,
        oid: treeOid,
      });

      for (const entry of tree) {
        const filepath = prefix ? `${prefix}/${entry.path}` : entry.path;

        if (shouldIgnorePath(filepath)) continue;

        if (entry.type === 'tree') {
          await findUlyzFiles(entry.oid, filepath);
        } else if (entry.type === 'blob' && entry.path.endsWith('.ulyz')) {
          ulyzFiles.push(filepath);
        }
      }
    }

    await findUlyzFiles(latestCommit.commit.tree);

    // Filter by selected files if provided
    const filesToProcess = selectedFilesFilter && selectedFilesFilter.length > 0
      ? ulyzFiles.filter(f => selectedFilesFilter.includes(f))
      : ulyzFiles;

    console.log(`Found ${ulyzFiles.length} .ulyz files, processing ${filesToProcess.length}`);
    onProgress?.({ type: 'progress', data: { stage: 'files_found', count: filesToProcess.length } });

    // Build file histories efficiently
    const fileHistories = new Map<string, FileVersion[]>();
    const blobCache = new Map<string, string>(); // Cache parsed content by blob OID
    const fileOidCache = new Map<string, Map<string, string>>(); // Track which OID each file has per commit

    // First pass: Build OID cache to detect when files actually change
    console.log('Building file change detection cache...');
    for (const commit of commits) {
      const commitOids = new Map<string, string>();

      for (const filePath of filesToProcess) {
        try {
          const { oid } = await git.readBlob({
            fs,
            dir: rootDir,
            oid: commit.oid,
            filepath: filePath,
          });
          commitOids.set(filePath, oid);
        } catch {
          // File doesn't exist in this commit
        }
      }

      fileOidCache.set(commit.oid, commitOids);
    }

    // Second pass: Only process commits where files actually changed
    console.log('Processing file changes...');
    const fileLastOid = new Map<string, string>(); // Track last seen OID for each file

    // Process commits in batches
    const BATCH_SIZE = 10;
    for (let i = 0; i < commits.length; i += BATCH_SIZE) {
      const batch = commits.slice(i, Math.min(i + BATCH_SIZE, commits.length));

      await Promise.all(
        batch.map(async (commit) => {
          const commitDate = new Date(commit.commit.committer.timestamp * 1000);
          const commitAuthor = commit.commit.author.name;
          const commitMessage = commit.commit.message;

          const commitOids = fileOidCache.get(commit.oid);
          if (!commitOids) return;

          // Check each file in parallel
          const FILE_CONCURRENCY = 4;
          for (let j = 0; j < filesToProcess.length; j += FILE_CONCURRENCY) {
            const filesBatch = filesToProcess.slice(j, Math.min(j + FILE_CONCURRENCY, filesToProcess.length));

            await Promise.all(
              filesBatch.map(async (filePath) => {
                const oid = commitOids.get(filePath);
                if (!oid) return; // File doesn't exist in this commit

                // Skip if file hasn't changed since last commit
                if (fileLastOid.get(filePath) === oid) {
                  return;
                }

                fileLastOid.set(filePath, oid);

                try {
                  const { blob } = await git.readBlob({
                    fs,
                    dir: rootDir,
                    oid: commit.oid,
                    filepath: filePath,
                  });

                  // Check cache first
                  let content = blobCache.get(oid);

                  if (!content) {
                    content = await parseUlyzContent(blob);
                    blobCache.set(oid, content);
                  }

                  if (!fileHistories.has(filePath)) {
                    fileHistories.set(filePath, []);
                  }

                  fileHistories.get(filePath)!.push({
                    hash: commit.oid,
                    date: commitDate,
                    message: commitMessage,
                    author: commitAuthor,
                    content: content || 'Unable to parse content',
                  });
                } catch (error) {
                  console.error(`Error processing ${filePath} in commit ${commit.oid}:`, error);
                }
              })
            );
          }
        })
      );

      // Stream progress
      onProgress?.({
        type: 'progress',
        data: {
          stage: 'processing',
          processed: Math.min(i + BATCH_SIZE, commits.length),
          total: commits.length,
        },
      });
    }

    console.log(`Blob cache size: ${blobCache.size} unique contents`);

    // Convert to array and sort versions
    const result: FileHistory[] = [];
    let totalVersions = 0;

    for (const [filePath, versions] of fileHistories.entries()) {
      versions.sort((a, b) => a.date.getTime() - b.date.getTime());
      result.push({ path: filePath, versions });
      totalVersions += versions.length;

      // Stream each completed file
      onProgress?.({
        type: 'file',
        data: { path: filePath, versionCount: versions.length },
      });
    }

    console.log(`\n=== Complete ===`);
    console.log(`Commits: ${commits.length}, Files: ${result.length}, Versions: ${totalVersions}`);
    console.log(`Cache efficiency: ${((1 - blobCache.size / totalVersions) * 100).toFixed(1)}% deduplication`);

    const repoData = {
      files: result,
      totalCommits: commits.length,
    };

    onProgress?.({ type: 'complete', data: repoData });

    return repoData;
  } finally {
    // Cleanup temp directory
    try {
      await rm(tmpDir, { recursive: true, force: true });
      console.log('Cleaned up temp directory');
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }
}