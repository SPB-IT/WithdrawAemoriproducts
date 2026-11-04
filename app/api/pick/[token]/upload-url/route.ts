import { NextRequest, NextResponse } from 'next/server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { resolvePickLink } from '@/lib/stock-request/pick-links';
import { createUploadTarget, getBillRow } from '@/lib/stock-request/queries';

export const dynamic = 'force-dynamic';

// รูปสินค้าทดแทนจากลิงก์หยิบของ — สิทธิ์มาจากรหัสลิงก์ · เก็บในโฟลเดอร์ของสาขาเจ้าของบิล
export const POST = handle(async (_request: NextRequest, context: { params: Promise<{ token: string }> }) => {
  const link = await resolvePickLink((await context.params).token);
  const bill = await getBillRow(link.bill_id);
  if (bill.status !== 'billed') throw new ApiError(410, 'SR_LINK_DONE', 'บิลนี้จัดส่งแล้ว ลิงก์หยิบของใช้ไม่ได้แล้ว');
  return NextResponse.json(await createUploadTarget(bill.branch_id));
});
