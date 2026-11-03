import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { assertPhotoUploaded, processStorageCleanup, rpc } from '@/lib/stock-request/queries';
import type { BillItemRow } from '@/lib/stock-request/types';
import { optionalText, readJson, requireInt, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ itemId: string }> };

const cleanup = () => processStorageCleanup().catch((error) => console.error('[stock-request] cleanup', error));

// สาขาแก้รายการที่ลงผิด — ได้เฉพาะตอนบิลยังไม่ถูกตัด (ตรวจ + ล็อกบิลใน database function)
export const PATCH = handle(async (request: NextRequest, context: Context) => {
  const branch = await requireBranchContext(request);
  const { itemId } = await context.params;
  const body = await readJson(request);

  const photoPath = optionalText(body.photoPath, 200);
  if (photoPath) {
    if (!photoPath.startsWith(`${branch.id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
    await assertPhotoUploaded(photoPath);
  }

  const item = await rpc<BillItemRow>('branch_update_item', {
    p_branch_id: branch.id,
    p_item_id: requireUuid(itemId, 'รหัสรายการ'),
    p_product_name: requireText(body.productName, 200, 'ชื่อสินค้า'),
    p_product_code: requireText(body.productCode, 100, 'รหัสสินค้า'),
    p_stock_on_hand: requireInt(body.stockOnHand, 'จำนวนคงเหลือ'),
    p_staff_note: optionalText(body.staffNote, 1000),
    p_photo_path: photoPath,
  });
  if (photoPath) await cleanup(); // ลบรูปเก่าที่ถูกแทนที่
  return NextResponse.json({ item });
});

// สาขาลบรายการที่ลงผิด — ได้เฉพาะตอนบิลยังไม่ถูกตัด และสำนักงานใหญ่ยังไม่แก้รายการนั้น
export const DELETE = handle(async (request: NextRequest, context: Context) => {
  const branch = await requireBranchContext(request);
  const { itemId } = await context.params;
  const result = await rpc('branch_delete_item', {
    p_branch_id: branch.id,
    p_item_id: requireUuid(itemId, 'รหัสรายการ'),
  });
  await cleanup();
  return NextResponse.json({ result });
});
