// lib/storage/postgres.ts
import { Pool } from 'pg';

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});

export interface SessionData {
  sessionId: string;
  data: any;
  createdAt: Date;
  updatedAt: Date;
}

export async function initDatabase() {
  const client = await pool.connect();
  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS sessions (
        session_id VARCHAR(255) PRIMARY KEY,
        data JSONB NOT NULL,
        created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
      );

      CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at);
    `);
  } finally {
    client.release();
  }
}

export async function saveSession(sessionId: string, sessionData: any): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query(
      `INSERT INTO sessions (session_id, data, updated_at)
       VALUES ($1, $2, CURRENT_TIMESTAMP)
       ON CONFLICT (session_id)
       DO UPDATE SET data = $2, updated_at = CURRENT_TIMESTAMP`,
      [sessionId, sessionData]
    );
  } finally {
    client.release();
  }
}

export async function loadSession(sessionId: string): Promise<any> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT data, created_at FROM sessions WHERE session_id = $1',
      [sessionId]
    );

    if (result.rows.length === 0) {
      throw new Error('Session not found');
    }

    return result.rows[0].data;
  } finally {
    client.release();
  }
}

export async function listSessions(limit: number = 50): Promise<SessionData[]> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'SELECT session_id, data, created_at, updated_at FROM sessions ORDER BY updated_at DESC LIMIT $1',
      [limit]
    );

    return result.rows.map(row => ({
      sessionId: row.session_id,
      data: row.data,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } finally {
    client.release();
  }
}

export async function deleteSession(sessionId: string): Promise<void> {
  const client = await pool.connect();
  try {
    await client.query('DELETE FROM sessions WHERE session_id = $1', [sessionId]);
  } finally {
    client.release();
  }
}

export async function cleanupOldSessions(daysOld: number = 30): Promise<number> {
  const client = await pool.connect();
  try {
    const result = await client.query(
      'DELETE FROM sessions WHERE updated_at < NOW() - INTERVAL \'$1 days\' RETURNING session_id',
      [daysOld]
    );
    return result.rowCount || 0;
  } finally {
    client.release();
  }
}
