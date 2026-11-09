import { buildServer } from './app.ts';
import { config } from './config.ts';
import { openDatabase } from './db.ts';

const db = openDatabase(config.dbPath);

try {
  const app = await buildServer(db);
  await app.listen({ port: config.port, host: config.host });
  console.log(`WageProof running at ${config.publicUrl} (listening on ${config.host}:${config.port})`);
} catch (error) {
  console.error('Failed to start WageProof:', error);
  process.exitCode = 1;
}
