import { existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
export const APP_ROOT = resolve(here, '..'); // apps/api
export const REPO_ROOT = resolve(APP_ROOT, '..', '..');

/** Tiny .env loader so the app has zero runtime config dependencies. */
function loadDotEnv(): void {
  const file = resolve(APP_ROOT, '.env');
  if (!existsSync(file)) return;
  for (const rawLine of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    const value = line.slice(eq + 1).trim();
    if (process.env[key] === undefined) process.env[key] = value;
  }
}
loadDotEnv();

const port = Number(process.env.PORT ?? 4000);

export const config = {
  port,
  host: process.env.HOST ?? '0.0.0.0',
  publicUrl: process.env.PUBLIC_URL ?? `http://localhost:${port}`,
  dbPath: process.env.DB_PATH ? resolve(REPO_ROOT, process.env.DB_PATH) : resolve(REPO_ROOT, 'data/wageproof.db'),
  adminToken: process.env.ADMIN_TOKEN ?? '',
};
