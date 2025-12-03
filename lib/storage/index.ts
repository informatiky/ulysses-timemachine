import {
  saveSessionFS,
  loadSessionFS,
  initFileSystem
} from './filesystem';

export async function initStorage() {
  await initFileSystem();
}

export async function saveSession(sessionId: string, sessionData: any): Promise<void> {
  return saveSessionFS(sessionId, sessionData);
}

export async function loadSession(sessionId: string): Promise<any> {
  return loadSessionFS(sessionId);
}
