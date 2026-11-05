import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { assertPhotoUploaded, logBranchAction, pickItemFields, processStorageCleanup, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillItemRow } from '@/lib/stock-request/types';
import { optionalText, readJson, requireOrderQty, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ itemId: string }> };

const cleanup = () => processStorageCleanup().catch((error) => console.error('[stock-request] cleanup', error));

/** ข้อมูลก่อนแก้/ลบ สำหรับบันทึกประวัติ (ตรวจสาขาซ้ำใน database function อยู่แล้ว) */
async function loadBefore(itemId: string) {
  const { data } = await getServiceClient().from('bill_items').select('*').eq('id', itemId).maybeSingle();
  return data as BillItemRow | null;
}

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

  const id = requireUuid(itemId, 'รหัสรายการ');
  const staffName = requireText(body.staffName, 100, 'ชื่อผู้แก้ไข');
  const before = await loadBefore(id);
  const item = await rpc<BillItemRow>('branch_update_item', {
    p_branch_id: branch.id,
    p_item_id: id,
    p_product_name: requireText(body.productName, 200, 'ชื่อสินค้า'),
    p_product_code: requireText(body.productCode, 100, 'รหัสสินค้า'),
    p_stock_on_hand: requireOrderQty(body.stockOnHand), // ช่อง stock_on_hand = จำนวนที่สาขาต้องการสั่ง
    p_staff_note: optionalText(body.staffNote, 1000),
    p_photo_path: photoPath,
  });
  if (photoPath) await cleanup(); // ลบรูปเก่าที่ถูกแทนที่
  await logBranchAction({ billId: item.bill_id, itemId: item.id, staffName, action: 'item_update', before: pickItemFields(before), after: pickItemFields(item) });
  return NextResponse.json({ item });
});

// สาขาลบรายการที่ลงผิด — ได้เฉพาะตอนบิลยังไม่ถูกตัด และสำนักงานใหญ่ยังไม่แก้รายการนั้น
export const DELETE = handle(async (request: NextRequest, context: Context) => {
  const branch = await requireBranchContext(request);
  const { itemId } = await context.params;
  const id = requireUuid(itemId, 'รหัสรายการ');
  const body = await readJson(request).catch(() => ({}) as Record<string, unknown>);
  const staffName = requireText(body.staffName, 100, 'ชื่อผู้ลบรายการ');
  const before = await loadBefore(id);
  const result = await rpc('branch_delete_item', { p_branch_id: branch.id, p_item_id: id });
  if (before) await logBranchAction({ billId: before.bill_id, itemId: id, staffName, action: 'item_remove', before: pickItemFields(before) });
  await cleanup();
  return NextResponse.json({ result });
});
