import crypto from 'node:crypto';
import { and, eq, gt, lt, ne } from 'drizzle-orm';
import type { Db } from '../db/index.js';
import { sessions, users } from '../db/schema.js';

export const SESSION_COOKIE = 'zm_session';

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

export function createSession(
  db: Db,
  userId: number,
  ttlDays: number,
): { token: string; expiresAt: Date } {
  const token = crypto.randomBytes(32).toString('base64url');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ttlDays * 86_400_000);
  db.insert(sessions)
    .values({
      tokenHash: hashToken(token),
      userId,
      createdAt: now.toISOString(),
      expiresAt: expiresAt.toISOString(),
    })
    .run();
  // Opportunistic cleanup of expired sessions.
  db.delete(sessions).where(lt(sessions.expiresAt, now.toISOString())).run();
  return { token, expiresAt };
}

export function findSessionUser(db: Db, token: string): { id: number; email: string } | null {
  const row = db
    .select({ id: users.id, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(
      and(
        eq(sessions.tokenHash, hashToken(token)),
        gt(sessions.expiresAt, new Date().toISOString()),
      ),
    )
    .get();
  return row ?? null;
}

export function deleteSession(db: Db, token: string): void {
  db.delete(sessions)
    .where(eq(sessions.tokenHash, hashToken(token)))
    .run();
}

/** Logs the user out everywhere except the current session (used after a password change). */
export function deleteOtherSessions(db: Db, userId: number, keepToken: string): void {
  db.delete(sessions)
    .where(and(eq(sessions.userId, userId), ne(sessions.tokenHash, hashToken(keepToken))))
    .run();
}
