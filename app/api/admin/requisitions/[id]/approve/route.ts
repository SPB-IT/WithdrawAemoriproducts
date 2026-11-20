import { NextResponse } from 'next/server';
import { changeStock, dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

const MAX_QTY = 10_000;
const MAX_EXTRA = 50;

type Detail = { id: string; item_id: string | null; quantity: number; price_at_time: number | null; rejection_reason: string | null };
type DetailWithName = Detail & { items: { name: string } | { name: string }[] | null };
type ItemRow = { id: string; name: string; price: number | null; is_active: boolean | null };

function qty(raw: unknown) {
  if (typeof raw !== 'number' || !Number.isInteger(raw) || raw < 1 || raw > MAX_QTY) {
    throw new ApiError(400, 'INVALID_INPUT', `จำนวนต้องเป็นจำนวนเต็ม 1–${MAX_QTY}`);
  }
  return raw;
}

function list(raw: unknown, label: string): Record<string, unknown>[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw) || raw.length > MAX_EXTRA) throw new ApiError(400, 'INVALID_INPUT', `${label}ไม่ถูกต้อง`);
  return raw.map((entry) => {
    if (!entry || typeof entry !== 'object') throw new ApiError(400, 'INVALID_INPUT', `${label}ไม่ถูกต้อง`);
    return entry as Record<string, unknown>;
  });
}

// อนุมัติใบเบิก: บันทึกจำนวนที่จะจัดส่ง (+ รายการที่ผู้ดูแลเพิ่ม/ทดแทน) → คำนวณยอดจากราคาในฐานข้อมูล → ตัดสต็อก (ครั้งเดียวเท่านั้น)
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสใบเบิก');
  const body = await readJson(request);
  const quantities = (body.quantities ?? {}) as Record<string, unknown>;
  const additions = list(body.additions, 'รายการที่เพิ่ม').map((a) => ({ itemId: requireUuid(a.item_id as string, 'รหัสสินค้า'), quantity: qty(a.quantity) }));
  const substitutions = list(body.substitutions, 'รายการทดแทน').map((s) => ({
    detailId: requireUuid(s.detail_id as string, 'รหัสรายการเดิม'),
    itemId: requireUuid(s.item_id as string, 'รหัสสินค้า'),
    quantity: qty(s.quantity),
  }));

  const db = serviceDb();
  const { data: requisition, error } = await db.from('requisitions').select('status').eq('id', id).maybeSingle();
  if (error) throw dbError(error, 'อ่านใบเบิกไม่สำเร็จ');
  if (!requisition) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบใบเบิกนี้');
  if (requisition.status === 'approved') throw new ApiError(409, 'ALREADY_APPROVED', 'ใบเบิกนี้อนุมัติไปแล้ว');

  const { data: rows, error: detailError } = await db
    .from('requisition_details')
    .select('id, item_id, quantity, price_at_time, rejection_reason, items (name)')
    .eq('requisition_id', id);
  if (detailError) throw dbError(detailError, 'อ่านรายการสินค้าไม่สำเร็จ');

  const allRows = (rows ?? []) as unknown as DetailWithName[];
  const nameOf = (d: DetailWithName) => (Array.isArray(d.items) ? d.items[0]?.name : d.items?.name) ?? 'สินค้า';
  const substitutedIds = new Set(substitutions.map((s) => s.detailId));
  const active = allRows.filter((detail) => !detail.rejection_reason && !substitutedIds.has(detail.id));

  for (const s of substitutions) {
    if (!allRows.some((d) => d.id === s.detailId && !d.rejection_reason)) throw new ApiError(400, 'INVALID_INPUT', 'รายการที่จะทดแทนไม่ถูกต้อง');
  }
  if (active.length + additions.length + substitutions.length === 0) {
    throw new ApiError(400, 'NOTHING_TO_SHIP', 'ไม่สามารถอนุมัติได้ เนื่องจากไม่มีรายการสินค้าที่จะจัดส่ง');
  }

  for (const detail of active) {
    const raw = quantities[detail.id];
    if (raw === undefined) continue;
    detail.quantity = qty(raw);
  }

  // สินค้าที่เพิ่ม/ทดแทนต้องมีอยู่จริงและเปิดใช้งาน — ราคาใช้จากฐานข้อมูลเสมอ
  const newItemIds = [...new Set([...additions.map((a) => a.itemId), ...substitutions.map((s) => s.itemId)])];
  const itemMap = new Map<string, ItemRow>();
  if (newItemIds.length > 0) {
    const { data: items, error: itemError } = await db.from('items').select('id, name, price, is_active').in('id', newItemIds);
    if (itemError) throw dbError(itemError, 'อ่านข้อมูลสินค้าไม่สำเร็จ');
    for (const item of (items ?? []) as ItemRow[]) itemMap.set(item.id, item);
    for (const itemId of newItemIds) {
      const item = itemMap.get(itemId);
      if (!item) throw new ApiError(400, 'INVALID_INPUT', 'ไม่พบสินค้าที่เลือก');
      if (item.is_active === false) throw new ApiError(400, 'INVALID_INPUT', `สินค้า "${item.name}" ปิดใช้งานอยู่`);
    }
  }

  const newRows = [
    ...additions.map((a) => ({ requisition_id: id, item_id: a.itemId, quantity: a.quantity, price_at_time: Number(itemMap.get(a.itemId)?.price) || 0, admin_note: 'เพิ่มโดยผู้ดูแล' })),
    ...substitutions.map((s) => {
      const original = allRows.find((d) => d.id === s.detailId) as DetailWithName;
      return { requisition_id: id, item_id: s.itemId, quantity: s.quantity, price_at_time: Number(itemMap.get(s.itemId)?.price) || 0, admin_note: `ทดแทน ${nameOf(original)}` };
    }),
  ];

  // เพิ่มรายการใหม่ก่อน (ถ้าพลาด เช่นยังไม่ได้รัน migration จะยังไม่แตะรายการเดิม)
  let inserted: { id: string; item_id: string | null; quantity: number; price_at_time: number | null }[] = [];
  if (newRows.length > 0) {
    const { data, error: insertError } = await db.from('requisition_details').insert(newRows).select('id, item_id, quantity, price_at_time');
    if (insertError) {
      if (insertError.code === '42703' || insertError.code === 'PGRST204') {
        throw new ApiError(500, 'MIGRATION_MISSING', 'ฐานข้อมูลยังไม่มีคอลัมน์ admin_note กรุณารัน migration ก่อนเพิ่ม/ทดแทนสินค้า');
      }
      throw dbError(insertError, 'เพิ่มรายการสินค้าไม่สำเร็จ');
    }
    inserted = data ?? [];
  }

  // รายการเดิมที่ถูกทดแทน → ทำเครื่องหมายปฏิเสธพร้อมเหตุผล (ไม่ตัดสต็อก ไม่คิดเงิน)
  for (const s of substitutions) {
    const { error: markError } = await db
      .from('requisition_details')
      .update({ rejection_reason: `ทดแทนด้วย ${itemMap.get(s.itemId)?.name ?? 'สินค้าอื่น'}` })
      .eq('id', s.detailId);
    if (markError) throw dbError(markError, 'บันทึกการทดแทนสินค้าไม่สำเร็จ');
  }

  const updates = await Promise.all(
    active.map((detail) => db.from('requisition_details').update({ quantity: detail.quantity }).eq('id', detail.id)),
  );
  const updateError = updates.find((result) => result.error)?.error;
  if (updateError) throw dbError(updateError, 'บันทึกจำนวนสินค้าไม่สำเร็จ');

  const shipping = [...active, ...inserted];
  const totalPrice = shipping.reduce((sum, detail) => sum + (Number(detail.price_at_time) || 0) * detail.quantity, 0);
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
    shipping.filter((detail) => detail.item_id).map((detail) => changeStock(detail.item_id as string, detail.quantity, 'decrement')),
  );
  const stockWarning = stockResults.some(Boolean)
    ? 'อนุมัติใบเบิกสำเร็จ แต่ตัดจำนวนคงเหลือบางรายการไม่สำเร็จ กรุณาปรับที่หน้าคลังสินค้า'
    : null;

  return NextResponse.json({ ok: true, totalPrice, stockWarning });
});
