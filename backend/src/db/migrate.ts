import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { pool } from './supabase';

async function runMigration() {
  console.log('Running database migration...');
  const sql = fs.readFileSync(path.join(__dirname, 'schema.sql'), 'utf-8');

  try {
    await pool.query(sql);
    console.log('Migration completed successfully!');
  } catch (err: any) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

runMigration();
