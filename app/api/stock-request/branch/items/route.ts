import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { assertPhotoUploaded, logBranchAction, pickItemFields, rpc } from '@/lib/stock-request/queries';
import type { BillItemRow } from '@/lib/stock-request/types';
import { optionalText, readJson, requireOrderQty, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// สาขาเพิ่มรายการเข้าบิลที่เปิดอยู่ — บันทึกลงฐานข้อมูลทันที
export const POST = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const body = await readJson(request);

  const photoPath = requireText(body.photoPath, 200, 'รูปสินค้า');
  if (!photoPath.startsWith(`${branch.id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
  await assertPhotoUploaded(photoPath);

  const staffName = requireText(body.staffName, 100, 'ชื่อผู้ลงรายการ');
  const item = await rpc<BillItemRow>('add_branch_item', {
    p_branch_id: branch.id,
    p_item_id: requireUuid(body.itemId, 'รหัสรายการ'),
    p_product_name: requireText(body.productName, 200, 'ชื่อสินค้า'),
    p_product_code: requireText(body.productCode, 100, 'รหัสสินค้า'),
    p_stock_on_hand: requireOrderQty(body.stockOnHand), // ช่อง stock_on_hand = จำนวนที่สาขาต้องการสั่ง
    p_staff_note: optionalText(body.staffNote, 1000),
    p_photo_path: photoPath,
    p_staff_name: staffName,
  });
  await logBranchAction({ billId: item.bill_id, itemId: item.id, staffName, action: 'item_add', after: pickItemFields(item) });
  return NextResponse.json({ item });
});
