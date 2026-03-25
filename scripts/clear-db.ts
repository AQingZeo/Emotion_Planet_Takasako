/**
 * Delete all rows from submissions. Stop `npm run dev` first if you get SQLITE_BUSY.
 */

import Database from 'better-sqlite3';
import fs from 'node:fs';
import { DB_PATH } from '../server/db.ts';

if (!fs.existsSync(DB_PATH)) {
  console.log('No database file yet at', DB_PATH);
  process.exit(0);
}

const db = new Database(DB_PATH);
try {
  const before = db.prepare('SELECT COUNT(*) AS n FROM submissions').get() as { n: number };
  db.prepare('DELETE FROM submissions').run();
  console.log(`Cleared ${before.n} submission(s). Database: ${DB_PATH}`);
} finally {
  db.close();
}
