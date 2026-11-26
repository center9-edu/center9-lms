import { redirect } from 'next/navigation';
import { apiFetch } from '../../lib/api';

// Headers the API sets for a lesson file; everything else stays behind.
const FORWARDED = ['content-type', 'content-length', 'content-disposition', 'x-content-type-options', 'cache-control'];

/** A lesson file through the web origin, with the session: PDF shows in an iframe, DOCX downloads. The API checks the role. */
export async function GET(request: Request, ctx: RouteContext<'/tep/[id]'>) {
  const { id } = await ctx.params;
  // Tied to the browser's request instead of a fixed timeout: a large file on a slow line may take minutes.
  const res = await apiFetch(`/lesson-files/${encodeURIComponent(id)}`, { signal: request.signal });
  if (res.status === 401) {
    redirect('/dang-nhap');
  }
  if (!res.ok) {
    await res.body?.cancel();
    return new Response('Không tìm thấy tệp.', { status: res.status >= 500 ? 502 : 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
  }
  const headers = new Headers();
  for (const name of FORWARDED) {
    const value = res.headers.get(name);
    if (value) {
      headers.set(name, value);
    }
  }
  return new Response(res.body, { headers });
}
