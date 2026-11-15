import { NextRequest, NextResponse } from 'next/server';
import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-auth';
import { STOCK_REQUEST_TESTING } from '@/lib/stock-request/testing';
import { DEFAULT_CLOSED_MESSAGE, getSystemStatuses } from '@/lib/system-status';

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  if (pathname === '/admin/access') return NextResponse.next();

  // ระบบที่ถูกปิดจากหลังบ้าน: API ฝั่งพนักงานตอบ 503 (หน้าเว็บแสดงข้อความปิดผ่าน layout) · ผู้ดูแลยังใช้ได้
  const closedSystem = pathname.startsWith('/api/requisition') ? 'requisition' : pathname.startsWith('/api/stock-request') ? 'stock-request' : null;
  if (closedSystem) {
    const state = (await getSystemStatuses())[closedSystem];
    if (state.closed && !(await verifyAdminSession(request.cookies.get(ADMIN_COOKIE_NAME)?.value, process.env.ADMIN_SESSION_SECRET ?? ''))) {
      return NextResponse.json({ error: state.message?.trim() || DEFAULT_CLOSED_MESSAGE, code: 'SYSTEM_CLOSED' }, { status: 503 });
    }
    // ระบบเปิดอยู่ (หรือเป็นผู้ดูแล): API เบิกสินค้าไม่ต้องใช้รหัสผู้ดูแล — ปล่อยผ่านตามเดิม
    if (closedSystem === 'requisition') return NextResponse.next();
  }

  // ฝั่งสาขาของระบบแจ้งสินค้าใกล้หมด: ล็อกด้วยรหัสผู้ดูแลเฉพาะช่วงทดสอบ
  const isStockRequestBranch = pathname.startsWith('/stock-request') || pathname.startsWith('/api/stock-request');
  if (isStockRequestBranch && !STOCK_REQUEST_TESTING) return NextResponse.next();

  const secret = process.env.ADMIN_SESSION_SECRET ?? '';
  const token = request.cookies.get(ADMIN_COOKIE_NAME)?.value;
  if (await verifyAdminSession(token, secret)) return NextResponse.next();

  // API (เรียกด้วย fetch) ตอบเป็น JSON แทนการ redirect
  if (pathname.startsWith('/admin/stock-request/api/') || pathname.startsWith('/api/stock-request')) {
    return NextResponse.json({ error: 'กรุณาเข้าสู่โหมดผู้ดูแลก่อน', code: 'SR_UNAUTHENTICATED' }, { status: 401 });
  }

  const accessUrl = new URL('/admin/access', request.url);
  accessUrl.searchParams.set('returnTo', pathname);
  return NextResponse.redirect(accessUrl);
}

export const config = {
  matcher: ['/admin/:path*', '/stock-request/:path*', '/api/stock-request/:path*', '/api/requisition/:path*'],
};
