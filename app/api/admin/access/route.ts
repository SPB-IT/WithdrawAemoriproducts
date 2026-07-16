import { timingSafeEqual } from 'crypto';
import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, ADMIN_SESSION_SECONDS, createAdminSession } from '@/lib/admin-auth';

const attempts = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

function safeEqual(left: string, right: string) {
  const leftBuffer = Buffer.from(left);
  const rightBuffer = Buffer.from(right);
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
}

export async function POST(request: NextRequest) {
  const forwardedFor = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim();
  const clientKey = forwardedFor || request.headers.get('x-real-ip') || 'local';
  const now = Date.now();
  const current = attempts.get(clientKey);
  if (current && current.resetAt > now && current.count >= MAX_ATTEMPTS) {
    return NextResponse.json({ error: 'ลองรหัสหลายครั้งเกินไป กรุณารอ 15 นาที' }, { status: 429 });
  }
  if (current && current.resetAt <= now) attempts.delete(clientKey);

  const body = await request.json().catch(() => null) as { password?: string } | null;
  const expectedPassword = process.env.ADMIN_ACCESS_PASSWORD ?? '';
  const sessionSecret = process.env.ADMIN_SESSION_SECRET ?? '';
  if (!expectedPassword || !sessionSecret) {
    return NextResponse.json({ error: 'ระบบผู้ดูแลยังไม่ได้ตั้งค่า' }, { status: 503 });
  }

  if (!body?.password || !safeEqual(body.password, expectedPassword)) {
    const attempt = attempts.get(clientKey) ?? { count: 0, resetAt: now + WINDOW_MS };
    attempt.count += 1;
    attempts.set(clientKey, attempt);
    return NextResponse.json({ error: 'ไม่สามารถเข้าสู่โหมดผู้ดูแลได้' }, { status: 401 });
  }

  attempts.delete(clientKey);
  const response = NextResponse.json({ ok: true });
  response.cookies.set(ADMIN_COOKIE_NAME, await createAdminSession(sessionSecret), {
    httpOnly: true,
    sameSite: 'strict',
    secure: process.env.NODE_ENV === 'production',
    maxAge: ADMIN_SESSION_SECONDS,
    path: '/admin',
  });
  return response;
}
