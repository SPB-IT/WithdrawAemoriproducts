import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { createPickLink, getActivePickLink, revokePickLinks } from '@/lib/stock-request/pick-links';
import { getBillRow } from '@/lib/stock-request/queries';
import { requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ billId: string }> };

// ลิงก์หยิบของของบิล (แอดมินเท่านั้น)
// GET: สถานะลิงก์ที่ใช้อยู่ · POST: สร้างลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที) · DELETE: ยกเลิกลิงก์
export const GET = handle(async (_request: NextRequest, context: Context) => {
  await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  return NextResponse.json({ link: bill.status === 'billed' ? await getActivePickLink(bill.id) : null });
});

export const POST = handle(async (request: NextRequest, context: Context) => {
  await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  if (bill.status !== 'billed') throw new ApiError(409, 'SR_NOT_PICKABLE', 'สร้างลิงก์หยิบของได้เฉพาะบิลที่ตัดแล้วและยังไม่จัดส่ง');
  const { token, link } = await createPickLink(bill.id);
  return NextResponse.json({ link, url: `${request.nextUrl.origin}/pick/${token}` });
});

export const DELETE = handle(async (_request: NextRequest, context: Context) => {
  await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  await revokePickLinks(bill.id);
  return NextResponse.json({ ok: true });
});
