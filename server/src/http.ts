import type { FastifyRequest } from 'fastify';
import { z } from 'zod';

export class HttpError extends Error {
  constructor(
    public readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

export function requireUser(request: FastifyRequest): { id: number; email: string } {
  if (!request.user) throw new HttpError(401, 'Требуется вход');
  return request.user;
}

export function parseWith<T extends z.ZodType>(schema: T, value: unknown): z.infer<T> {
  const result = schema.safeParse(value);
  if (!result.success) {
    const issue = result.error.issues[0];
    const where = issue?.path.length ? `${issue.path.join('.')}: ` : '';
    throw new HttpError(
      400,
      `Некорректный запрос: ${where}${issue?.message ?? 'ошибка валидации'}`,
    );
  }
  return result.data;
}

export const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'ожидается дата YYYY-MM-DD');

declare module 'fastify' {
  interface FastifyRequest {
    user: { id: number; email: string } | null;
    sessionToken: string | null;
  }
}
