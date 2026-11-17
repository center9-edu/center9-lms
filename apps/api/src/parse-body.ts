import { BadRequestException } from '@nestjs/common';
import { z } from 'zod';

/** Validates a request body at the controller boundary; the first problem becomes the 400 message. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  // A request without a body arrives as undefined; report the missing fields instead.
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}

/** Optional free text: trimmed, and blank or missing becomes null. */
export function optionalText(field: string, max: number) {
  const message = `${field} must be a string of at most ${max} characters or null`;
  return z
    .string(message)
    .trim()
    .max(max, message)
    .nullish()
    .transform((value) => value || null);
}
