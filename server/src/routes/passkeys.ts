import crypto from 'node:crypto';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
  type AuthenticationResponseJSON,
  type RegistrationResponseJSON,
} from '@simplewebauthn/server';
import { and, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PasskeyInfo } from '@zm/shared';
import { ChallengeStore } from '../auth/challenges.js';
import type { Config } from '../config.js';
import type { Db } from '../db/index.js';
import { passkeys, users } from '../db/schema.js';
import { HttpError, parseWith, requireUser } from '../http.js';
import { startSession } from './auth.js';

const LOGIN_CHALLENGE_COOKIE = 'zm_wa';

const renameSchema = z.object({ name: z.string().trim().min(1).max(64) });
const registerVerifySchema = z.object({
  response: z.looseObject({ id: z.string(), rawId: z.string(), type: z.string() }),
  name: z.string().trim().max(64).optional(),
});
const loginVerifySchema = z.object({
  response: z.looseObject({ id: z.string(), rawId: z.string(), type: z.string() }),
});

function toInfo(row: typeof passkeys.$inferSelect): PasskeyInfo {
  return {
    id: row.id,
    name: row.name,
    createdAt: row.createdAt,
    lastUsedAt: row.lastUsedAt,
    deviceType: row.deviceType,
    backedUp: row.backedUp,
  };
}

function defaultName(userAgent: string | undefined): string {
  const ua = userAgent ?? '';
  const os = /iPhone|iPad/.test(ua)
    ? 'iOS'
    : /Android/.test(ua)
      ? 'Android'
      : /Mac OS X/.test(ua)
        ? 'macOS'
        : /Windows/.test(ua)
          ? 'Windows'
          : /Linux/.test(ua)
            ? 'Linux'
            : 'Устройство';
  return `Passkey (${os})`;
}

export async function passkeyRoutes(app: FastifyInstance, opts: { db: Db; config: Config }) {
  const { db, config } = opts;
  const challenges = new ChallengeStore();
  const rateLimit = { rateLimit: { max: 20, timeWindow: '1 minute' } };

  app.get('/api/passkeys', async (request) => {
    const me = requireUser(request);
    return db.select().from(passkeys).where(eq(passkeys.userId, me.id)).all().map(toInfo);
  });

  app.post('/api/passkeys/register/options', async (request) => {
    const me = requireUser(request);
    const existing = db.select().from(passkeys).where(eq(passkeys.userId, me.id)).all();
    const options = await generateRegistrationOptions({
      rpName: config.rpName,
      rpID: config.rpId,
      userName: me.email,
      userDisplayName: me.email,
      userID: new TextEncoder().encode(`zm-user-${me.id}`),
      attestationType: 'none',
      excludeCredentials: existing.map((p) => ({
        id: p.id,
        transports: p.transports ?? undefined,
      })),
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    challenges.set(`reg:${me.id}`, options.challenge);
    return options;
  });

  app.post('/api/passkeys/register/verify', async (request) => {
    const me = requireUser(request);
    const body = parseWith(registerVerifySchema, request.body);
    const expectedChallenge = challenges.take(`reg:${me.id}`);
    if (!expectedChallenge)
      throw new HttpError(400, 'Время на привязку passkey истекло, попробуйте ещё раз');
    let verification;
    try {
      verification = await verifyRegistrationResponse({
        response: body.response as unknown as RegistrationResponseJSON,
        expectedChallenge,
        expectedOrigin: config.appOrigin,
        expectedRPID: config.rpId,
        requireUserVerification: false,
      });
    } catch (e) {
      throw new HttpError(400, `Не удалось проверить passkey: ${(e as Error).message}`);
    }
    if (!verification.verified) throw new HttpError(400, 'Passkey не прошёл проверку');
    const { credential, credentialDeviceType, credentialBackedUp } = verification.registrationInfo;
    const row = db
      .insert(passkeys)
      .values({
        id: credential.id,
        userId: me.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? null,
        deviceType: credentialDeviceType,
        backedUp: credentialBackedUp,
        name: body.name || defaultName(request.headers['user-agent']),
        createdAt: new Date().toISOString(),
      })
      .onConflictDoNothing()
      .returning()
      .get();
    if (!row) throw new HttpError(409, 'Этот passkey уже привязан');
    return toInfo(row);
  });

  app.patch<{ Params: { id: string } }>('/api/passkeys/:id', async (request) => {
    const me = requireUser(request);
    const { name } = parseWith(renameSchema, request.body);
    const row = db
      .update(passkeys)
      .set({ name })
      .where(and(eq(passkeys.id, request.params.id), eq(passkeys.userId, me.id)))
      .returning()
      .get();
    if (!row) throw new HttpError(404, 'Passkey не найден');
    return toInfo(row);
  });

  app.delete<{ Params: { id: string } }>('/api/passkeys/:id', async (request) => {
    const me = requireUser(request);
    const res = db
      .delete(passkeys)
      .where(and(eq(passkeys.id, request.params.id), eq(passkeys.userId, me.id)))
      .run();
    if (res.changes === 0) throw new HttpError(404, 'Passkey не найден');
    return { ok: true };
  });

  app.post('/api/passkeys/login/options', { config: rateLimit }, async (_request, reply) => {
    const options = await generateAuthenticationOptions({
      rpID: config.rpId,
      userVerification: 'preferred',
      allowCredentials: [],
    });
    const key = crypto.randomBytes(16).toString('base64url');
    challenges.set(`auth:${key}`, options.challenge);
    reply.setCookie(LOGIN_CHALLENGE_COOKIE, key, {
      path: '/api/passkeys/login',
      httpOnly: true,
      sameSite: 'strict',
      secure: config.secureCookies,
      maxAge: 300,
    });
    return options;
  });

  app.post('/api/passkeys/login/verify', { config: rateLimit }, async (request, reply) => {
    const body = parseWith(loginVerifySchema, request.body);
    const key = request.cookies[LOGIN_CHALLENGE_COOKIE];
    const expectedChallenge = key ? challenges.take(`auth:${key}`) : null;
    reply.clearCookie(LOGIN_CHALLENGE_COOKIE, { path: '/api/passkeys/login' });
    if (!expectedChallenge) throw new HttpError(400, 'Время на вход истекло, попробуйте ещё раз');

    const response = body.response as unknown as AuthenticationResponseJSON;
    const passkey = db.select().from(passkeys).where(eq(passkeys.id, response.id)).get();
    if (!passkey) throw new HttpError(401, 'Этот passkey не привязан ни к одному аккаунту');

    let verification;
    try {
      verification = await verifyAuthenticationResponse({
        response,
        expectedChallenge,
        expectedOrigin: config.appOrigin,
        expectedRPID: config.rpId,
        credential: {
          id: passkey.id,
          publicKey: new Uint8Array(passkey.publicKey),
          counter: passkey.counter,
          transports: passkey.transports ?? undefined,
        },
        requireUserVerification: false,
      });
    } catch (e) {
      throw new HttpError(401, `Не удалось проверить passkey: ${(e as Error).message}`);
    }
    if (!verification.verified) throw new HttpError(401, 'Passkey не прошёл проверку');

    db.update(passkeys)
      .set({
        counter: verification.authenticationInfo.newCounter,
        backedUp: verification.authenticationInfo.credentialBackedUp,
        lastUsedAt: new Date().toISOString(),
      })
      .where(eq(passkeys.id, passkey.id))
      .run();
    const user = db
      .select({ id: users.id, email: users.email })
      .from(users)
      .where(eq(users.id, passkey.userId))
      .get();
    if (!user) throw new HttpError(401, 'Пользователь не найден');
    startSession(db, config, reply, user.id);
    return { user };
  });
}
