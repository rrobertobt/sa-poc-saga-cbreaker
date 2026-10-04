import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Path to the service's SQLite file; creates the directory if it doesn't exist. */
export function databasePath(defaultName: string): string {
  const path = process.env.DB_PATH ?? join('data', defaultName);
  mkdirSync(dirname(path), { recursive: true });
  return path;
}
