import { NextRequest, NextResponse } from 'next/server';
import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import { mkdir, writeFile, readdir, rm } from 'fs/promises';

export const runtime = 'nodejs';
export const maxDuration = 60;

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

export async function POST(request: NextRequest) {
  const tmpDir = path.join(process.cwd(), '.tmp', `discover-${Date.now()}`);

  try {
    const formData = await request.formData();
    const files: File[] = [];

    for (const [, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    await mkdir(tmpDir, { recursive: true });

    // Write files to temp directory
    for (const file of files) {
      const filepath = (file as any).webkitRelativePath || file.name;

      if (shouldIgnorePath(filepath)) {
        continue;
      }

      const buffer = await file.arrayBuffer();
      const data = Buffer.from(buffer);
      const fullPath = path.join(tmpDir, filepath);
      const dirPath = path.dirname(fullPath);

      await mkdir(dirPath, { recursive: true });
      await writeFile(fullPath, data);
    }

    // Find root directory
    const allFiles = await getAllFiles(tmpDir);
    const gitPaths = allFiles.filter(p => p.includes('.git'));

    if (gitPaths.length === 0) {
      throw new Error('No .git directory found');
    }

    const firstGitPath = gitPaths[0];
    const relativeGitPath = path.relative(tmpDir, firstGitPath);
    const rootDir = path.join(tmpDir, relativeGitPath.split('.git')[0]);

    // Get the latest commit
    const commits = await git.log({
      fs,
      dir: rootDir,
      depth: 1,
    });

    if (commits.length === 0) {
      throw new Error('No commits found');
    }

    // Find all .ulyz files in the latest commit
    const latestCommit = commits[0];
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

    // Sort files alphabetically
    ulyzFiles.sort();

    return NextResponse.json({ files: ulyzFiles });
  } catch (error) {
    console.error('Error discovering files:', error);
    return NextResponse.json(
      { error: 'Failed to discover files', details: String(error) },
      { status: 500 }
    );
  } finally {
    // Cleanup
    try {
      await rm(tmpDir, { recursive: true, force: true });
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }
}