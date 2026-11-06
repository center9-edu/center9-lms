import { randomBytes, randomInt, scrypt, timingSafeEqual } from 'node:crypto';
import type { ScryptOptions } from 'node:crypto';

// OWASP scrypt option N=2^15, r=8, p=3: about 32 MiB per hash. The parameters are stored in each hash,
// so they can be raised later without breaking existing passwords.
const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 3;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;
const MAX_MEMORY = 64 * 1024 * 1024;

// No 0/O, 1/l/I: temporary passwords are read aloud or copied by hand by children and parents.
const TEMPORARY_PASSWORD_ALPHABET = '23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ';
const TEMPORARY_PASSWORD_LENGTH = 12;

function deriveKey(password: string, salt: Buffer, keyLength: number, options: ScryptOptions): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password.normalize('NFC'), salt, keyLength, { ...options, maxmem: MAX_MEMORY }, (error, key) =>
      error ? reject(error) : resolve(key),
    );
  });
}

/** Returns `scrypt$N$r$p$salt$key`, with salt and key in base64url. */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await deriveKey(password, salt, KEY_LENGTH, { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION });
  return ['scrypt', COST, BLOCK_SIZE, PARALLELIZATION, salt.toString('base64url'), key.toString('base64url')].join('$');
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [algorithm, n, r, p, saltText, keyText, ...rest] = stored.split('$');
  const [N, R, P] = [n, r, p].map(Number);
  if (algorithm !== 'scrypt' || rest.length > 0 || !saltText || !keyText || ![N, R, P].every(Number.isSafeInteger)) {
    return false;
  }
  const expected = Buffer.from(keyText, 'base64url');
  // Invalid base64url decodes to an empty buffer, and two empty buffers compare equal.
  if (expected.length === 0) {
    return false;
  }
  try {
    const actual = await deriveKey(password, Buffer.from(saltText, 'base64url'), expected.length, { N, r: R, p: P });
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}

export function generateTemporaryPassword(): string {
  return Array.from(
    { length: TEMPORARY_PASSWORD_LENGTH },
    () => TEMPORARY_PASSWORD_ALPHABET[randomInt(TEMPORARY_PASSWORD_ALPHABET.length)],
  ).join('');
}
