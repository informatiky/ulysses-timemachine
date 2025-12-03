import { writeFile, readFile, readdir, unlink, mkdir, stat } from 'fs/promises';
import path from 'path';

const SESSIONS_DIR = path.join(process.cwd(), 'data', 'sessions');

export async function initFileSystem() {
  await mkdir(SESSIONS_DIR, { recursive: true });
}

export async function saveSessionFS(sessionId: string, sessionData: any): Promise<void> {
  await initFileSystem();
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  await writeFile(filePath, JSON.stringify(sessionData, null, 2), 'utf-8');
}

export async function loadSessionFS(sessionId: string): Promise<any> {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  const content = await readFile(filePath, 'utf-8');
  return JSON.parse(content);
}

export async function listSessionsFS(): Promise<Array<{ sessionId: string; createdAt: Date; size: number }>> {
  await initFileSystem();
  const files = await readdir(SESSIONS_DIR);
  const sessions = [];

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = await stat(filePath);
      sessions.push({
        sessionId: file.replace('.json', ''),
        createdAt: stats.mtime,
        size: stats.size,
      });
    }
  }

  return sessions.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
}

export async function deleteSessionFS(sessionId: string): Promise<void> {
  const filePath = path.join(SESSIONS_DIR, `${sessionId}.json`);
  await unlink(filePath);
}

export async function cleanupOldSessionsFS(daysOld: number = 30): Promise<number> {
  await initFileSystem();
  const files = await readdir(SESSIONS_DIR);
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
  let deletedCount = 0;

  for (const file of files) {
    if (file.endsWith('.json')) {
      const filePath = path.join(SESSIONS_DIR, file);
      const stats = await stat(filePath);

      if (stats.mtime < cutoffDate) {
        await unlink(filePath);
        deletedCount++;
      }
    }
  }

  return deletedCount;
}