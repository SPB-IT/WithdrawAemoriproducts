import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { rpc } from '@/lib/stock-request/queries';
import { optionalText, readJson, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลบ (หรือนำกลับ) รายการ — เป็น soft delete ข้อมูลเดิมยังอยู่ในประวัติ
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const { itemId } = await context.params;
  const body = await readJson(request);
  const result = await rpc('hq_set_item_removed', {
    p_admin_id: admin.id,
    p_item_id: requireUuid(itemId, 'รหัสรายการ'),
    p_expected_version: requireVersion(body.expectedVersion),
    p_removed: body.removed !== false,
    p_reason: optionalText(body.reason, 1000),
  });
  return NextResponse.json({ result });
});
