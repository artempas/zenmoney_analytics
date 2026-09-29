import { eq, sql } from 'drizzle-orm';
import type { FastifyInstance, FastifyReply } from 'fastify';
import { z } from 'zod';
import type { MeResponse } from '@zm/shared';
import { hashPassword, verifyPassword } from '../auth/password.js';
import {
  createSession,
  deleteOtherSessions,
  deleteSession,
  SESSION_COOKIE,
} from '../auth/session.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { settings, users } from '../db/schema.js';
import { HttpError, parseWith, requireUser } from '../http.js';

const credentialsSchema = z.object({
  email: z.string().trim().toLowerCase().max(254).pipe(z.email('некорректный email')),
  password: z.string().min(8, 'пароль должен быть не короче 8 символов').max(256),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().max(254),
  password: z.string().max(256),
});

const passwordChangeSchema = z.object({
  currentPassword: z.string().max(256),
  newPassword: z.string().min(8, 'пароль должен быть не короче 8 символов').max(256),
});

// Verifying against a dummy hash keeps timing similar for unknown emails.
let dummyHash: Promise<string> | null = null;

export function registrationOpen(db: Db, config: Config): boolean {
  if (config.allowRegistration) return true;
  const count =
    db
      .select({ n: sql<number>`count(*)` })
      .from(users)
      .get()?.n ?? 0;
  return count === 0;
}

export function startSession(db: Db, config: Config, reply: FastifyReply, userId: number): void {
  const { token, expiresAt } = createSession(db, userId, config.sessionTtlDays);
  reply.setCookie(SESSION_COOKIE, token, {
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    secure: config.secureCookies,
    expires: expiresAt,
  });
}

export async function authRoutes(app: FastifyInstance, opts: { db: Db; config: Config }) {
  const { db, config } = opts;
  const rateLimit = { rateLimit: { max: 10, timeWindow: '1 minute' } };

  app.get('/api/auth/me', async (request): Promise<MeResponse> => {
    return { user: request.user, registrationOpen: registrationOpen(db, config) };
  });

  app.post('/api/auth/register', { config: rateLimit }, async (request, reply) => {
    const { email, password } = parseWith(credentialsSchema, request.body);
    if (!registrationOpen(db, config)) throw new HttpError(403, 'Регистрация закрыта');
    const exists = db.select({ id: users.id }).from(users).where(eq(users.email, email)).get();
    if (exists) throw new HttpError(409, 'Пользователь с таким email уже существует');
    const passwordHash = await hashPassword(password);
    const user = db
      .insert(users)
      .values({ email, passwordHash, createdAt: new Date().toISOString() })
      .returning({ id: users.id, email: users.email })
      .get();
    db.insert(settings).values({ userId: user.id }).run();
    startSession(db, config, reply, user.id);
    return { user };
  });

  app.post('/api/auth/login', { config: rateLimit }, async (request, reply) => {
    const { email, password } = parseWith(loginSchema, request.body);
    const user = db.select().from(users).where(eq(users.email, email)).get();
    if (!user) {
      dummyHash ??= hashPassword('dummy-password-for-timing');
      await verifyPassword(await dummyHash, password);
      throw new HttpError(401, 'Неверный email или пароль');
    }
    if (!(await verifyPassword(user.passwordHash, password))) {
      throw new HttpError(401, 'Неверный email или пароль');
    }
    startSession(db, config, reply, user.id);
    return { user: { id: user.id, email: user.email } };
  });

  app.post('/api/auth/logout', async (request, reply) => {
    if (request.sessionToken) deleteSession(db, request.sessionToken);
    reply.clearCookie(SESSION_COOKIE, { path: '/' });
    return { ok: true };
  });

  app.post('/api/auth/password', { config: rateLimit }, async (request) => {
    const me = requireUser(request);
    const { currentPassword, newPassword } = parseWith(passwordChangeSchema, request.body);
    const user = db.select().from(users).where(eq(users.id, me.id)).get();
    if (!user || !(await verifyPassword(user.passwordHash, currentPassword))) {
      throw new HttpError(400, 'Текущий пароль указан неверно');
    }
    db.update(users)
      .set({ passwordHash: await hashPassword(newPassword) })
      .where(eq(users.id, me.id))
      .run();
    if (request.sessionToken) deleteOtherSessions(db, me.id, request.sessionToken);
    return { ok: true };
  });
}
