import {
  saveSession as saveSessionPG,
  loadSession as loadSessionPG,
  initDatabase
} from './postgres';
import {
  saveSessionFS,
  loadSessionFS,
  initFileSystem
} from './filesystem';

const STORAGE_TYPE = process.env.STORAGE_TYPE || 'filesystem'; // 'filesystem' or 'postgres'

export async function initStorage() {
  if (STORAGE_TYPE === 'postgres') {
    await initDatabase();
  } else {
    await initFileSystem();
  }
}

export async function saveSession(sessionId: string, sessionData: any): Promise<void> {
  if (STORAGE_TYPE === 'postgres') {
    return saveSessionPG(sessionId, sessionData);
  } else {
    return saveSessionFS(sessionId, sessionData);
  }
}

export async function loadSession(sessionId: string): Promise<any> {
  if (STORAGE_TYPE === 'postgres') {
    return loadSessionPG(sessionId);
  } else {
    return loadSessionFS(sessionId);
  }
}