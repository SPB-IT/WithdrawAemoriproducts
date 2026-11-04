import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { assertPhotoUploaded, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { optionalText, readJson, requireText, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// กำหนดสินค้าทดแทน (สินค้าเดิมไม่ถูกลบ ประวัติการทดแทนเก็บไว้ทุกครั้ง)
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const { itemId } = await context.params;
  const id = requireUuid(itemId, 'รหัสรายการ');
  const body = await readJson(request);

  const photoPath = optionalText(body.photoPath, 200);
  if (photoPath) {
    const { data, error } = await getServiceClient().from('bill_items').select('branch_id').eq('id', id).maybeSingle();
    if (error) throw fromDbError(error);
    if (!data || !photoPath.startsWith(`${data.branch_id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
    await assertPhotoUploaded(photoPath);
  }

  const result = await rpc('hq_set_substitution', {
    p_admin_id: admin.id,
    p_item_id: id,
    p_expected_version: requireVersion(body.expectedVersion),
    p_product_name: requireText(body.productName, 200, 'ชื่อสินค้าทดแทน'),
    p_product_code: requireText(body.productCode, 100, 'รหัสสินค้าทดแทน'),
    p_ship_qty: 0, // ไม่ใช้จำนวนจัดส่งแล้ว (คอลัมน์ยังบังคับ not null)
    p_photo_path: photoPath,
    p_reason: requireText(body.reason, 1000, 'เหตุผลในการเปลี่ยนสินค้า'),
  });
  return NextResponse.json({ result });
});

export const DELETE = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const { itemId } = await context.params;
  const body = await readJson(request);
  const result = await rpc('hq_clear_substitution', {
    p_admin_id: admin.id,
    p_item_id: requireUuid(itemId, 'รหัสรายการ'),
    p_expected_version: requireVersion(body.expectedVersion),
    p_reason: optionalText(body.reason, 1000),
  });
  return NextResponse.json({ result });
});
