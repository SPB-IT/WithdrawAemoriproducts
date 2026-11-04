import { NextResponse } from 'next/server';
import { dbError, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { isUuid, readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

const MAX_LINES = 200;
const MAX_QTY = 10_000;

// พนักงานสาขาส่งใบเบิก — ตรวจสาขา/สินค้า และใช้ราคาจากฐานข้อมูลเสมอ (ไม่เชื่อราคาจากเบราว์เซอร์)
export const POST = handle(async (request: Request) => {
  const body = await readJson(request);
  const branchName = requireText(body.branchName, 200, 'ชื่อสาขา');
  const requesterName = requireText(body.requesterName, 100, 'ชื่อผู้เบิก');

  const lines = Array.isArray(body.items) ? body.items : [];
  if (lines.length === 0) throw new ApiError(400, 'INVALID_INPUT', 'กรุณาเลือกสินค้าอย่างน้อย 1 รายการ');
  if (lines.length > MAX_LINES) throw new ApiError(400, 'INVALID_INPUT', `เบิกได้ไม่เกิน ${MAX_LINES} รายการต่อใบ`);

  // รวมรายการซ้ำ + ตรวจจำนวน
  const quantities = new Map<string, number>();
  for (const line of lines) {
    const { itemId, quantity } = (line ?? {}) as { itemId?: unknown; quantity?: unknown };
    if (!isUuid(itemId)) throw new ApiError(400, 'INVALID_INPUT', 'รายการสินค้าไม่ถูกต้อง');
    if (typeof quantity !== 'number' || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QTY) {
      throw new ApiError(400, 'INVALID_INPUT', `จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY}`);
    }
    quantities.set(itemId, (quantities.get(itemId) ?? 0) + quantity);
  }

  const db = serviceDb();
  const [branch, items] = await Promise.all([
    db.from('branches').select('name').eq('name', branchName).is('archived_at', null).maybeSingle(),
    db.from('items').select('id, price, is_active').in('id', [...quantities.keys()]),
  ]);
  if (branch.error) throw dbError(branch.error, 'ตรวจสอบสาขาไม่สำเร็จ');
  if (!branch.data) throw new ApiError(400, 'INVALID_BRANCH', 'ไม่พบสาขานี้ กรุณาเลือกสาขาใหม่');
  if (items.error) throw dbError(items.error, 'ตรวจสอบสินค้าไม่สำเร็จ');
  const found = new Map((items.data ?? []).map((item: { id: string; price: number | null; is_active: boolean }) => [item.id, item]));
  for (const id of quantities.keys()) {
    if (!found.get(id)?.is_active) throw new ApiError(400, 'ITEM_UNAVAILABLE', 'มีสินค้าบางรายการที่ปิดใช้งานแล้ว กรุณารีเฟรชหน้าแล้วเลือกใหม่');
  }

  const { data: requisition, error: reqError } = await db
    .from('requisitions')
    .insert({ branch_name: branchName, requester_name: requesterName, status: 'pending', total_price: 0 })
    .select('id')
    .single();
  if (reqError || !requisition) throw dbError(reqError, 'สร้างใบเบิกไม่สำเร็จ');

  const detailRows = [...quantities].map(([itemId, quantity]) => ({
    requisition_id: requisition.id,
    item_id: itemId,
    quantity,
    price_at_time: Number(found.get(itemId)?.price) || 0,
  }));
  const { error: detailError } = await db.from('requisition_details').insert(detailRows);
  if (detailError) {
    // ไม่ให้เหลือใบเบิกเปล่าค้างในระบบ
    await db.from('requisitions').delete().eq('id', requisition.id);
    throw dbError(detailError, 'บันทึกรายการสินค้าไม่สำเร็จ');
  }

  return NextResponse.json({ id: requisition.id });
});
