import { NextResponse } from 'next/server';
import { changeStock, dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

const MAX_QTY = 10_000;

type Detail = { id: string; item_id: string | null; quantity: number; price_at_time: number | null; rejection_reason: string | null };

// อนุมัติใบเบิก: บันทึกจำนวนที่จะจัดส่ง → คำนวณยอดจากราคาในฐานข้อมูล → ตัดสต็อก (ครั้งเดียวเท่านั้น)
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสใบเบิก');
  const body = await readJson(request);
  const quantities = (body.quantities ?? {}) as Record<string, unknown>;

  const db = serviceDb();
  const { data: requisition, error } = await db.from('requisitions').select('status').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'อ่านใบเบิกไม่สำเร็จ');
  if (!requisition) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบใบเบิกนี้');
  if (requisition.status === 'approved') throw new ApiError(409, 'ALREADY_APPROVED', 'ใบเบิกนี้อนุมัติไปแล้ว');

  const { data: rows, error: detailError } = await db
    .from('requisition_details')
    .select('id, item_id, quantity, price_at_time, rejection_reason')
    .eq('requisition_id', id);
  if (detailError) throw dbError(detailError, 'อ่านรายการสินค้าไม่สำเร็จ');

  const active = ((rows ?? []) as Detail[]).filter((detail) => !detail.rejection_reason);
  if (active.length === 0) throw new ApiError(400, 'NOTHING_TO_SHIP', 'ไม่สามารถอนุมัติได้ เนื่องจากไม่มีรายการสินค้าที่จะจัดส่ง');

  for (const detail of active) {
    const raw = quantities[detail.id];
    if (raw === undefined) continue;
    if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_QTY) {
      throw new ApiError(400, 'INVALID_INPUT', `จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY}`);
    }
    detail.quantity = raw;
  }

  const updates = await Promise.all(
    active.map((detail) => db.from('requisition_details').update({ quantity: detail.quantity }).eq('id', detail.id)),
  );
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) throw dbError(updateError, 'บันทึกจำนวนสินค้าไม่สำเร็จ');

  const totalPrice = active.reduce((sum, detail) => sum + (Number(detail.price_at_time) || 0) * detail.quantity, 0);
  // อัปเดตเฉพาะเมื่อยังไม่อนุมัติ — กันตัดสต็อกซ้ำเมื่อกดพร้อมกัน
  const { data: approved, error: approveError } = await db
    .from('requisitions')
    .update({ status: 'approved', total_price: totalPrice })
    .eq('id', id)
    .neq('status', 'approved')
    .select('id');
  if (approveError) throw dbError(approveError, 'อนุมัติใบเบิกไม่สำเร็จ');
  if (!approved?.length) throw new ApiError(409, 'ALREADY_APPROVED', 'ใบเบิกนี้อนุมัติไปแล้ว');

  const stockResults = await Promise.all(
    active.filter((detail) => detail.item_id).map((detail) => changeStock(detail.item_id as string, detail.quantity, 'decrement')),
  );
  const stockWarning = stockResults.some(Boolean)
    ? 'อนุมัติใบเบิกสำเร็จ แต่ตัดจำนวนคงเหลือบางรายการไม่สำเร็จ กรุณาปรับที่หน้าคลังสินค้า'
    : null;

  return NextResponse.json({ ok: true, totalPrice, stockWarning });
});
