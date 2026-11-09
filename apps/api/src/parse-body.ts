import { BadRequestException } from '@nestjs/common';
import type { z } from 'zod';

/** Validates a request body at the controller boundary; the first problem becomes the 400 message. */
export function parseBody<T extends z.ZodType>(schema: T, body: unknown): z.output<T> {
  // A request without a body arrives as undefined; report the missing fields instead.
  const result = schema.safeParse(body ?? {});
  if (!result.success) {
    throw new BadRequestException(result.error.issues[0]?.message ?? 'Invalid request body');
  }
  return result.data;
}
