/**
 * The same-origin check a Server Action gets from Next: the Origin's host must match the first X-Forwarded-Host,
 * or the Host when there is none (a proxy that rewrites Host sets X-Forwarded-Host instead).
 */
export function isSameOrigin(headers: Headers): boolean {
  const origin = headers.get('origin');
  const host = headers.get('x-forwarded-host')?.split(',')[0]?.trim() || headers.get('host');
  return Boolean(origin && host && URL.parse(origin)?.host === host);
}
