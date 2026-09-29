import path from 'node:path';
import { buildApp } from './app.js';
import { loadConfig } from './config.js';
import { openDb } from './db/index.js';

const config = loadConfig();
const db = openDb(path.join(config.dataDir, 'zenmoney.db'));
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
