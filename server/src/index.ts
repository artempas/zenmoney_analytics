import path from 'node:path';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb, type Db } from './db/index.js';

const config = loadConfig();
const dbFile = path.join(config.dataDir, 'zenmoney.db');
let db: Db;
try {
  db = openDb(dbFile);
} catch (e) {
  console.error(`Cannot open database ${dbFile}: ${(e as Error).message}`);
  process.exit(1);
}
const app = await buildApp(config, db);

const shutdown = async (signal: string) => {
  app.log.info(`${signal} received, shutting down`);
  await app.close();
  db.$client.close();
  process.exit(0);
};
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('SIGTERM', () => void shutdown('SIGTERM'));

await app.listen({ port: config.port, host: config.host });
app.log.info(`App origin: ${config.appOrigin} (passkey RP ID: ${config.rpId})`);
