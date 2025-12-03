const fs = require('fs').promises;
const path = require('path');

async function cleanupFilesystem(daysOld = 30) {
  const sessionsDir = path.join(process.cwd(), 'data', 'sessions');
  const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);

  try {
    const files = await fs.readdir(sessionsDir);
    let deletedCount = 0;

    for (const file of files) {
      if (file.endsWith('.json')) {
        const filePath = path.join(sessionsDir, file);
        const stats = await fs.stat(filePath);

        if (stats.mtime < cutoffDate) {
          await fs.unlink(filePath);
          deletedCount++;
          console.log(`Deleted: ${file}`);
        }
      }
    }

    console.log(`Cleanup complete. Deleted ${deletedCount} old sessions.`);
  } catch (error) {
    console.error('Cleanup failed:', error);
  }
}

async function cleanupPostgres(daysOld = 30) {
  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
  });

  try {
    const result = await pool.query(
      `DELETE FROM sessions
       WHERE updated_at < NOW() - INTERVAL '${daysOld} days'
       RETURNING session_id`
    );
    console.log(`Deleted ${result.rowCount} old sessions from database.`);
  } catch (error) {
    console.error('Database cleanup failed:', error);
  } finally {
    await pool.end();
  }
}

// Main
const storageType = process.env.STORAGE_TYPE || 'filesystem';
const daysOld = parseInt(process.env.CLEANUP_DAYS || '30', 10);

console.log(`Starting cleanup (storage: ${storageType}, days: ${daysOld})...`);

if (storageType === 'postgres') {
  cleanupPostgres(daysOld);
} else {
  cleanupFilesystem(daysOld);
}