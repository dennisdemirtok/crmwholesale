import { Pool } from 'pg';

export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : undefined,
});

// Helper for single-row queries
export async function queryOne<T = any>(text: string, params?: any[]): Promise<T | null> {
  const { rows } = await pool.query(text, params);
  return rows[0] || null;
}

// Helper for multi-row queries
export async function queryAll<T = any>(text: string, params?: any[]): Promise<T[]> {
  const { rows } = await pool.query(text, params);
  return rows;
}

// Helper for insert/update that returns the row
export async function queryOneOrThrow<T = any>(text: string, params?: any[]): Promise<T> {
  const { rows } = await pool.query(text, params);
  if (!rows[0]) throw new Error('Query returned no rows');
  return rows[0];
}
