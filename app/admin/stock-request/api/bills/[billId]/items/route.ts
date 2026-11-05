import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { assertPhotoUploaded, getBillRow, rpc } from '@/lib/stock-request/queries';
import { optionalInt, optionalText, readJson, requireText, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// HQ เพิ่มรายการสินค้าเข้าบิล (หลังตัดบิลต้องมีเหตุผล — ตรวจใน database function)
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const { billId } = await context.params;
  const bill = await getBillRow(requireUuid(billId, 'รหัสบิล'));
  const body = await readJson(request);

  const photoPath = optionalText(body.photoPath, 200);
  if (photoPath) {
    if (!photoPath.startsWith(`${bill.branch_id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
    await assertPhotoUploaded(photoPath);
  }

  const result = await rpc<{ version: number; item_id: string }>('hq_add_item', {
    p_admin_id: admin.id,
    p_bill_id: bill.id,
    p_expected_version: requireVersion(body.expectedVersion),
    p_item_id: crypto.randomUUID(),
    p_product_name: requireText(body.productName, 200, 'ชื่อสินค้า'),
    p_product_code: requireText(body.productCode, 100, 'รหัสสินค้า'),
    p_stock_on_hand: optionalInt(body.stockOnHand, 'จำนวนที่สั่ง'),
    p_hq_ship_qty: null,
    p_hq_note: optionalText(body.hqNote, 1000),
    p_photo_path: photoPath,
    p_reason: optionalText(body.reason, 1000),
  });
  return NextResponse.json({ result });
});
