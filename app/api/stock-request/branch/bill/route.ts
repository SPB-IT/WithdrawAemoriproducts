import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { loadBillDetails, rpc } from '@/lib/stock-request/queries';
import type { BillRow } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

// บิลที่เปิดอยู่ของสาขา (สร้างให้อัตโนมัติถ้ายังไม่มี)
export const GET = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const bill = await rpc<BillRow>('get_or_open_bill', { p_branch_id: branch.id });
  const [detail] = await loadBillDetails([bill], { includeRemoved: false });
  return NextResponse.json({ bill: detail });
});
