import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { getBillRow, loadBillDetails } from '@/lib/stock-request/queries';
import { requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// บิลของสาขาทีละใบ (หน้าเช็คของที่ได้รับ / ส่งออก PDF) — ดูได้เฉพาะบิลของสาขาตัวเอง
export const GET = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const branch = await requireBranchContext(request);
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  if (bill.branch_id !== branch.id) throw new ApiError(404, 'SR_BILL_NOT_FOUND', 'ไม่พบบิลนี้');
  const [detail] = await loadBillDetails([bill], { audit: 'after_billing' });
  return NextResponse.json({ bill: detail });
});
