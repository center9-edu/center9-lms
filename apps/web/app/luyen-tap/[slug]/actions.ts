'use server';

import { headers } from 'next/headers';
import { API_URL } from '../api';
import type { RunActionResult, RunMode, RunResult } from '../types';

const BUSY_MESSAGE = 'Hệ thống chấm bài đang bận. Em thử lại sau ít phút nhé.';

export async function runCode(slug: string, code: string, mode: RunMode): Promise<RunActionResult> {
  const requestHeaders = await headers();
  // The proxy in front of apps/web must overwrite these headers, or clients could dodge the rate limit.
  const clientIp = requestHeaders.get('x-forwarded-for')?.split(',')[0].trim() ?? requestHeaders.get('x-real-ip');

  try {
    const res = await fetch(`${API_URL}/coding-practice/problems/${encodeURIComponent(slug)}/runs`, {
      method: 'POST',
      cache: 'no-store',
      signal: AbortSignal.timeout(25_000),
      headers: { 'Content-Type': 'application/json', ...(clientIp ? { 'X-Client-Ip': clientIp } : {}) },
      body: JSON.stringify({ code, mode }),
    });
    if (res.ok) {
      return { ok: true, result: (await res.json()) as RunResult };
    }
    if (res.status === 429) {
      return { ok: false, message: 'Em chạy hơi nhanh rồi! Đợi khoảng một phút rồi thử lại nhé.' };
    }
    if (res.status === 400) {
      return { ok: false, message: 'Code của em đang trống hoặc quá dài. Em kiểm tra lại nhé.' };
    }
    return { ok: false, message: BUSY_MESSAGE };
  } catch {
    return { ok: false, message: BUSY_MESSAGE };
  }
}
