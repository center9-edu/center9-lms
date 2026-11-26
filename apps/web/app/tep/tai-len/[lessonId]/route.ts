import { cookies } from 'next/headers';
import { apiFetch, SESSION_COOKIE } from '../../../lib/api';
import { isSameOrigin } from '../../../lib/same-origin';

// The API's 20 MB per file, plus room for the multipart headers around it.
const MAX_BODY_BYTES = 20 * 1024 * 1024 + 64 * 1024;

const error = (status: number, message: string) => Response.json({ message }, { status });

/**
 * Upload of one lesson file (multipart, part "file"), passed on to the API.
 * A Route Handler, not a Server Action: raising the 1 MB Server Action body limit would raise it for every action.
 * Checks what a Server Action would get for free (same origin), and refuses oversized bodies before reading them.
 */
export async function POST(request: Request, ctx: RouteContext<'/tep/tai-len/[lessonId]'>) {
  if (!isSameOrigin(request.headers)) {
    return error(403, 'Cross-origin upload');
  }
  if (!(await cookies()).has(SESSION_COOKIE)) {
    return error(401, 'Not signed in');
  }
  // Node stops reading at Content-Length, so a client cannot send more than it declares.
  const length = Number(request.headers.get('content-length'));
  if (!length) {
    return error(411, 'Content-Length required');
  }
  if (length > MAX_BODY_BYTES) {
    return error(413, 'File too large');
  }
  const { lessonId } = await ctx.params;
  // ponytail: buffers the body (≤ 20 MB) instead of streaming it; stream it with `duplex: 'half'` if memory gets tight.
  const res = await apiFetch(`/lessons/${encodeURIComponent(lessonId)}/files`, {
    method: 'POST',
    headers: { 'Content-Type': request.headers.get('content-type') ?? '' },
    body: await request.blob(),
    signal: request.signal,
  });
  return new Response(res.body, { status: res.status, headers: { 'Content-Type': res.headers.get('content-type') ?? 'application/json' } });
}
