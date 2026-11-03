import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { rpc } from '@/lib/stock-request/queries';
import { readJson, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ตัดบิล — ทั้งหมดทำใน transaction เดียวใน database (ล็อกบิล, กันตัดซ้ำ, snapshot, เปิดบิลใหม่)
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const { billId } = await context.params;
  const body = await readJson(request);
  const result = await rpc<{ bill_id: string; bill_no: string; new_bill_no: string }>('cut_bill', {
    p_admin_id: admin.id,
    p_bill_id: requireUuid(billId, 'รหัสบิล'),
    p_expected_version: requireVersion(body.expectedVersion),
  });
  return NextResponse.json({ result });
});
