import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { processStorageCleanup, rpc } from '@/lib/stock-request/queries';
import { readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// พนักงานสาขายืนยันว่าได้รับสินค้าแล้ว (บันทึกชื่อ + เวลา) แล้วล้างประวัติที่เกิน 3 บิล
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const branch = await requireBranchContext(request);
  const { billId } = await context.params;
  const body = await readJson(request);
  const result = await rpc<{ purged_bills: number }>('confirm_received', {
    p_branch_id: branch.id,
    p_bill_id: requireUuid(billId, 'รหัสบิล'),
    p_staff_name: requireText(body.staffName, 100, 'ชื่อผู้รับสินค้า'),
  });
  if (result.purged_bills > 0) await processStorageCleanup().catch((error) => console.error('[stock-request] cleanup', error));
  return NextResponse.json({ result });
});
