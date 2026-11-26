// Run with `pnpm --filter @center9/web test` (node:test, Node strips the types).
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { isSameOrigin } from './same-origin.ts';

const request = (headers: Record<string, string>) => new Headers(headers);

describe('isSameOrigin', () => {
  it('compares the Origin with the Host', () => {
    assert.equal(isSameOrigin(request({ origin: 'http://localhost:3000', host: 'localhost:3000' })), true);
    assert.equal(isSameOrigin(request({ origin: 'https://evil.example', host: 'localhost:3000' })), false);
  });

  it('uses the first X-Forwarded-Host behind a proxy that rewrites Host, as Next does for Server Actions', () => {
    const behindProxy = { origin: 'https://lms.example.vn', host: '127.0.0.1:3000' };
    assert.equal(isSameOrigin(request({ ...behindProxy, 'x-forwarded-host': 'lms.example.vn, 10.0.0.1' })), true);
    assert.equal(isSameOrigin(request(behindProxy)), false);
    assert.equal(isSameOrigin(request({ ...behindProxy, 'x-forwarded-host': 'other.example' })), false);
  });

  it('refuses a request without an Origin, or with one that does not parse', () => {
    assert.equal(isSameOrigin(request({ host: 'localhost:3000' })), false);
    assert.equal(isSameOrigin(request({ origin: 'null', host: 'localhost:3000' })), false);
  });
});
