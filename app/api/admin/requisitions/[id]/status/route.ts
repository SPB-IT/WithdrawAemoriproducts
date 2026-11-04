import { NextResponse } from 'next/server';
import { changeStock, dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

const STATUSES = ['pending', 'approved', 'rejected'] as const;
type Status = (typeof STATUSES)[number];

// เปลี่ยนสถานะใบเบิก (ปฏิเสธ / ยกเลิกการอนุมัติ) — ถ้าเดิมอนุมัติแล้ว (ตัดสต็อกไปแล้ว) จะคืนสต็อกให้
// การอนุมัติใช้ /approve เพราะต้องบันทึกจำนวนและตัดสต็อก
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสใบเบิก');
  const body = await readJson(request);
  const status = body.status as Status;
  if (!STATUSES.includes(status) || status === 'approved') throw new ApiError(400, 'INVALID_INPUT', 'สถานะไม่ถูกต้อง');

  const db = serviceDb();
  const { data: current, error } = await db.from('requisitions').select('status').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'อ่านใบเบิกไม่สำเร็จ');
  if (!current) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบใบเบิกนี้');

  // เปลี่ยนสถานะก่อน (กันคืนสต็อกซ้ำถ้ากดพร้อมกัน: อัปเดตเฉพาะเมื่อสถานะยังเป็นค่าเดิม)
  const { data: updated, error: updateError } = await db
    .from('requisitions')
    .update({ status })
    .eq('id', id)
    .eq('status', current.status)
    .select('id');
  if (updateError) throw dbError(updateError, 'เปลี่ยนสถานะไม่สำเร็จ');
  if (!updated?.length) throw new ApiError(409, 'CONFLICT', 'ใบเบิกนี้ถูกเปลี่ยนสถานะไปแล้ว กรุณาโหลดใหม่');

  let stockWarning: string | null = null;
  if (current.status === 'approved') {
    const { data: details, error: detailError } = await db
      .from('requisition_details')
      .select('item_id, quantity, rejection_reason')
      .eq('requisition_id', id);
    if (detailError) throw dbError(detailError, 'อ่านรายการเพื่อคืนสต็อกไม่สำเร็จ');
    const results = await Promise.all(
      (details ?? [])
        .filter((detail: { item_id: string | null; rejection_reason: string | null }) => detail.item_id && !detail.rejection_reason)
        .map((detail: { item_id: string; quantity: number }) => changeStock(detail.item_id, detail.quantity, 'increment')),
    );
    if (results.some(Boolean)) stockWarning = 'เปลี่ยนสถานะแล้ว แต่คืนจำนวนคงเหลือบางรายการไม่สำเร็จ กรุณาปรับที่หน้าคลังสินค้า';
  }

  return NextResponse.json({ ok: true, stockWarning });
});
