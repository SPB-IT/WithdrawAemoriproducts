import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-auth';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/access') return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifyAdminSession(token, secret)) return NextResponse.next();

  // API ของระบบแจ้งสินค้าใกล้หมด (เรียกด้วย fetch) ตอบเป็น JSON แทนการ redirect
  if (pathname.startsWith('/admin/stock-request/api/')) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่โหมดผู้ดูแลก่อน', code: 'SR_UNAUTHENTICATED' }, { status: 401 });
  }

  const accessUrl = new URL('/admin/access', request.url);
  accessUrl.searchParams.set('returnTo', pathname);
  return NextResponse.redirect(accessUrl);
}

export const config = {
  matcher: ['/admin/:path*'],
};
