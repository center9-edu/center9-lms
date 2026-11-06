import { randomBytes, scryptSync } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { generateTemporaryPassword, hashPassword, verifyPassword } from './password.js';

describe('password', () => {
  it('verifies the right password and rejects a wrong one', async () => {
    const hash = await hashPassword('mật-khẩu đúng');
    expect(hash).toMatch(/^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
    expect(hash).not.toContain('mật-khẩu');
    await expect(verifyPassword('mật-khẩu đúng', hash)).resolves.toBe(true);
    await expect(verifyPassword('mật-khẩu sai', hash)).resolves.toBe(false);
  });

  it('salts every hash', async () => {
    expect(await hashPassword('same')).not.toBe(await hashPassword('same'));
  });

  it('verifies hashes made with older parameters', async () => {
    const salt = randomBytes(16);
    const key = scryptSync('old-password', salt, 32, { N: 1024, r: 8, p: 1 });
    const oldHash = `scrypt$1024$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
    await expect(verifyPassword('old-password', oldHash)).resolves.toBe(true);
    await expect(verifyPassword('other', oldHash)).resolves.toBe(false);
  });

  it('verifies hashes made with stronger parameters than today', async () => {
    const salt = randomBytes(16);
    const key = scryptSync('future-password', salt, 32, { N: 2 ** 16, r: 8, p: 1, maxmem: 256 * 2 ** 16 * 8 });
    const futureHash = `scrypt$${2 ** 16}$8$1$${salt.toString('base64url')}$${key.toString('base64url')}`;
    await expect(verifyPassword('future-password', futureHash)).resolves.toBe(true);
  });

  it('rejects malformed hashes instead of throwing', async () => {
    for (const stored of ['', 'plain-text', 'scrypt$x$8$1$abc$def', 'bcrypt$10$abc', 'scrypt$1024$8$1$abc$!!!']) {
      await expect(verifyPassword('anything', stored)).resolves.toBe(false);
    }
  });

  it('generates unambiguous temporary passwords', () => {
    const passwords = new Set(Array.from({ length: 50 }, generateTemporaryPassword));
    expect(passwords.size).toBe(50);
    for (const password of passwords) {
      expect(password).toMatch(/^[23456789abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ]{12}$/);
    }
  });
});
