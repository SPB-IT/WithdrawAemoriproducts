import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/admin/access', request.url), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', expires: new Date(0), path: '/' });
  // ลบ cookie แบบเดิมที่เคยตั้งไว้ที่ path /admin ด้วย
  response.headers.append('Set-Cookie', `${ADMIN_COOKIE_NAME}=; Path=/admin; Expires=Thu, 01 Jan 1970 00:00:00 GMT; HttpOnly; SameSite=Strict`);
  return response;
}
