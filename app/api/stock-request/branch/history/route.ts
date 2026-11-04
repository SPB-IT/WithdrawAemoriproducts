import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { loadBranchHistory } from '@/lib/stock-request/queries';

export const dynamic = 'force-dynamic';

// ประวัติ 3 บิลล่าสุดของสาขา (ไม่รวมบิลที่ยังเปิดอยู่) + บิลที่ปัญหายังไม่ปิด
export const GET = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const bills = await loadBranchHistory(branch.id);
  return NextResponse.json({ bills });
});
