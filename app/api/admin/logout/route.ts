import { NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME } from '@/lib/admin-auth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/admin/access', request.url), 303);
  response.cookies.set(ADMIN_COOKIE_NAME, '', { httpOnly: true, sameSite: 'strict', expires: new Date(0), path: '/admin' });
  return response;
}
