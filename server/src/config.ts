import path from 'node:path';
import { fileURLToPath } from 'node:url';

export interface Config {
  port: number;
  host: string;
  dataDir: string;
  appOrigin: string;
  rpId: string;
  rpName: string;
  allowRegistration: boolean;
  trustProxy: boolean;
  secureCookies: boolean;
  sessionTtlDays: number;
  webDist: string | null;
  logLevel: string;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined || value === '') return fallback;
  return ['1', 'true', 'yes', 'on'].includes(value.toLowerCase());
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const port = Number(env.PORT ?? 3000);
  const appOrigin = (env.APP_ORIGIN ?? `http://localhost:${port}`).replace(/\/+$/, '');
  let origin: URL;
  try {
    origin = new URL(appOrigin);
  } catch {
    throw new Error(`APP_ORIGIN is not a valid URL: ${appOrigin}`);
  }
  const here = path.dirname(fileURLToPath(import.meta.url));
  const defaultWebDist = path.resolve(here, '../../web/dist');

  return {
    port,
    host: env.HOST ?? '0.0.0.0',
    dataDir: path.resolve(env.DATA_DIR ?? './data'),
    appOrigin: origin.origin,
    rpId: env.RP_ID ?? origin.hostname,
    rpName: env.RP_NAME ?? 'ZenMoney Analytics',
    allowRegistration: bool(env.ALLOW_REGISTRATION, false),
    trustProxy: bool(env.TRUST_PROXY, false),
    secureCookies: bool(env.COOKIE_SECURE, origin.protocol === 'https:'),
    sessionTtlDays: Number(env.SESSION_TTL_DAYS ?? 30),
    webDist: env.WEB_DIST === '' ? null : path.resolve(env.WEB_DIST ?? defaultWebDist),
    logLevel: env.LOG_LEVEL ?? 'info',
  };
}
