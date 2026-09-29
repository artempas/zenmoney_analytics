import fs from 'node:fs';
import path from 'node:path';
import cookie from '@fastify/cookie';
import helmet from '@fastify/helmet';
import multipart from '@fastify/multipart';
import rateLimit from '@fastify/rate-limit';
import fastifyStatic from '@fastify/static';
import Fastify, { type FastifyInstance } from 'fastify';
import { findSessionUser, SESSION_COOKIE } from './auth/session.js';
import type { Config } from './config.js';
import type { Db } from './db/index.js';
import { HttpError } from './http.js';
import { analyticsRoutes } from './routes/analytics.js';
import { authRoutes } from './routes/auth.js';
import { importRoutes } from './routes/imports.js';
import { passkeyRoutes } from './routes/passkeys.js';
import { settingsRoutes } from './routes/settings.js';
import { transactionRoutes } from './routes/transactions.js';

const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

function originHost(origin: string): string | null {
  try {
    return new URL(origin).host;
  } catch {
    return null;
  }
}

export interface AppOptions {
  logger?: boolean;
  /** Clock override for tests. */
  now?: () => Date;
}

export async function buildApp(
  config: Config,
  db: Db,
  opts: AppOptions = {},
): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger === false ? false : { level: config.logLevel },
    trustProxy: config.trustProxy,
    bodyLimit: 1024 * 1024,
  });

  await app.register(cookie);
  await app.register(helmet, {
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        imgSrc: ["'self'", 'data:', 'blob:'],
        fontSrc: ["'self'", 'data:'],
        connectSrc: ["'self'"],
        objectSrc: ["'none'"],
        frameAncestors: ["'none'"],
        upgradeInsecureRequests: config.secureCookies ? [] : null,
      },
    },
    // Allow the app to be served over plain http on a LAN.
    strictTransportSecurity: config.secureCookies,
  });
  await app.register(rateLimit, { global: false });
  await app.register(multipart, { limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 } });

  app.decorateRequest('user', null);
  app.decorateRequest('sessionToken', null);

  app.addHook('onRequest', async (request, reply) => {
    if (!request.url.startsWith('/api/')) return;
    // CSRF: state-changing requests must come from our own origin.
    if (!['GET', 'HEAD', 'OPTIONS'].includes(request.method)) {
      const origin = request.headers.origin;
      if (origin !== undefined) {
        if (originHost(origin) !== request.host && origin !== config.appOrigin) {
          return reply.code(403).send({ error: 'Запрос с чужого источника отклонён' });
        }
      }
    }
    const token = request.cookies[SESSION_COOKIE];
    if (token) {
      const user = findSessionUser(db, token);
      if (user) {
        request.user = user;
        request.sessionToken = token;
      }
    }
  });

  app.setErrorHandler((error: Error & { statusCode?: number }, request, reply) => {
    if (error instanceof HttpError)
      return reply.code(error.statusCode).send({ error: error.message });
    const status = error.statusCode ?? 500;
    if (status >= 500) {
      request.log.error(error);
      return reply.code(500).send({ error: 'Внутренняя ошибка сервера' });
    }
    if (status === 413) return reply.code(413).send({ error: 'Файл слишком большой' });
    if (status === 429)
      return reply.code(429).send({ error: 'Слишком много попыток, подождите минуту' });
    return reply.code(status).send({ error: error.message });
  });

  app.get('/api/health', async () => ({ ok: true }));

  await app.register(authRoutes, { db, config });
  await app.register(passkeyRoutes, { db, config });
  await app.register(importRoutes, { db });
  await app.register(transactionRoutes, { db });
  await app.register(settingsRoutes, { db });
  await app.register(analyticsRoutes, { db, now: opts.now ?? (() => new Date()) });

  const webDist = config.webDist;
  const hasWeb = webDist !== null && fs.existsSync(path.join(webDist, 'index.html'));
  if (hasWeb) {
    await app.register(fastifyStatic, { root: webDist, wildcard: false, index: false });
    // Hashed assets can be cached forever; index.html must always be revalidated.
    app.get('/assets/*', (request, reply) => {
      const file = (request.params as { '*': string })['*'];
      reply.header('Cache-Control', 'public, max-age=31536000, immutable');
      return reply.sendFile(path.join('assets', file));
    });
  }

  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith('/api/') || !hasWeb || request.method !== 'GET') {
      return reply.code(404).send({ error: 'Не найдено' });
    }
    const file = request.url.split('?')[0]!;
    if (file !== '/' && !file.includes('..') && fs.existsSync(path.join(webDist!, file))) {
      return reply.sendFile(file.slice(1));
    }
    reply.header('Cache-Control', 'no-cache');
    return reply.sendFile('index.html');
  });

  return app;
}
