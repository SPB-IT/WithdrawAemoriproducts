import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { rpc } from '@/lib/stock-request/queries';
import { optionalInt, optionalText, readJson, requireText, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// แก้ไขรายการ: ส่งเฉพาะช่องที่เปลี่ยน
export const PATCH = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const { itemId } = await context.params;
  const body = await readJson(request);
  const input = (body.patch ?? {}) as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  if ('productName' in input) patch.product_name = requireText(input.productName, 200, 'ชื่อสินค้า');
  if ('productCode' in input) patch.product_code = requireText(input.productCode, 100, 'รหัสสินค้า');
  if ('stockOnHand' in input) patch.stock_on_hand = optionalInt(input.stockOnHand, 'จำนวนที่สั่ง');
  if ('hqNote' in input) patch.hq_note = optionalText(input.hqNote, 1000);
  if (Object.keys(patch).length === 0) throw new ApiError(400, 'SR_INVALID_INPUT', 'ไม่มีข้อมูลที่ต้องแก้ไข');

  const result = await rpc<{ version: number; changed: boolean }>('hq_update_item', {
    p_admin_id: admin.id,
    p_item_id: requireUuid(itemId, 'รหัสรายการ'),
    p_expected_version: requireVersion(body.expectedVersion),
    p_patch: patch,
    p_reason: optionalText(body.reason, 1000),
  });
  return NextResponse.json({ result });
});
