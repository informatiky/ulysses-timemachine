import { NextRequest, NextResponse } from 'next/server';
import git from 'isomorphic-git';
import fs from 'fs';
import path from 'path';
import { mkdir, writeFile, readdir, rm, access } from 'fs/promises';

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
  } catch (error) {
    console.error(`Error reading directory ${dir}:`, error);
  }

  return files;
}

export async function POST(request: NextRequest) {
  const tmpBaseDir = path.join(process.cwd(), '.tmp');
  const tmpDir = path.join(tmpBaseDir, `discover-${Date.now()}`);

  try {
    // Ensure .tmp base directory exists with proper permissions
    try {
      await access(tmpBaseDir);
    } catch {
      console.log('Creating .tmp directory...');
      await mkdir(tmpBaseDir, { recursive: true, mode: 0o775 });
    }

    console.log('Creating temp directory:', tmpDir);
    await mkdir(tmpDir, { recursive: true, mode: 0o775 });

    const formData = await request.formData();
    const files: File[] = [];

    for (const [, value] of formData.entries()) {
      if (value instanceof File) {
        files.push(value);
      }
    }

    console.log(`Received ${files.length} files`);

    if (files.length === 0) {
      return NextResponse.json({ error: 'No files uploaded' }, { status: 400 });
    }

    // Write files to temp directory
    let writtenCount = 0;
    for (const file of files) {
      const filepath = (file as any).webkitRelativePath || file.name;

      if (shouldIgnorePath(filepath)) {
        continue;
      }

      try {
        const buffer = await file.arrayBuffer();
        const data = Buffer.from(buffer);
        const fullPath = path.join(tmpDir, filepath);
        const dirPath = path.dirname(fullPath);

        await mkdir(dirPath, { recursive: true, mode: 0o775 });
        await writeFile(fullPath, data, { mode: 0o664 });
        writtenCount++;
      } catch (error) {
        console.error(`Error writing file ${filepath}:`, error);
        throw new Error(`Failed to write file ${filepath}: ${error}`);
      }
    }

    console.log(`Wrote ${writtenCount} files to temp directory`);

    // Find root directory
    const allFiles = await getAllFiles(tmpDir);
    const gitPaths = allFiles.filter(p => p.includes('.git'));

    console.log(`Found ${gitPaths.length} git-related files`);

    if (gitPaths.length === 0) {
      throw new Error('No .git directory found in uploaded files');
    }

    const firstGitPath = gitPaths[0];
    const relativeGitPath = path.relative(tmpDir, firstGitPath);
    const rootDir = path.join(tmpDir, relativeGitPath.split('.git')[0]);

    console.log('Git root directory:', rootDir);

    // Get the latest commit
    const commits = await git.log({
      fs,
      dir: rootDir,
      depth: 1,
    });

    if (commits.length === 0) {
      throw new Error('No commits found in repository');
    }

    console.log('Found commit:', commits[0].oid);

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

    console.log(`Discovered ${ulyzFiles.length} .ulyz files`);

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
      console.log('Cleaned up temp directory');
    } catch (error) {
      console.error('Failed to cleanup temp directory:', error);
    }
  }
}
