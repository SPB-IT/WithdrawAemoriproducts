import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { packItem } from '@/lib/stock-request/packing';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { optionalInt, optionalText, readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ติ๊ก/ยกเลิกติ๊ก "แพ็คแล้ว" ในหน้าแพ็คของ — ได้เฉพาะบิลที่ตัดแล้วและยังไม่จัดส่ง
// ของไม่พอ: ส่ง qty (น้อยกว่าที่สั่ง) + reason → บันทึกจำนวนที่ส่งจริง (ประวัติ + แจ้งสาขา)
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const itemId = requireUuid((await context.params).itemId, 'รหัสรายการ');
  const body = await readJson(request);
  const { picked } = body;
  if (typeof picked !== 'boolean') throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลไม่ถูกต้อง');

  const db = getServiceClient();
  const { data: item, error } = await db.from('bill_items').select('id, bill_id, is_removed, product_name, stock_on_hand, hq_ship_qty, bills(status)').eq('id', itemId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!item || item.is_removed) throw new ApiError(404, 'SR_ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  const status = (item.bills as unknown as { status: string } | null)?.status;
  if (status !== 'billed') throw new ApiError(409, 'SR_NOT_PICKABLE', 'แพ็คของได้เฉพาะบิลที่ตัดแล้วและยังไม่จัดส่ง');

  if (picked) {
    // ชื่อคนแพ็ค (ลงชื่อในหน้าแพ็คของ)
    const packerName = requireText(body.pickerName, 100, 'ชื่อผู้แพ็คของ');
    await packItem({ adminId: admin.id, billId: item.bill_id, item, packerName, qty: optionalInt(body.qty, 'จำนวนที่ส่งได้'), reason: optionalText(body.reason, 300) });
  } else {
    const { error: updateError } = await db.from('bill_items').update({ picked_at: null, picked_by: null }).eq('id', itemId);
    if (updateError) throw fromDbError(updateError);
  }
  const { data, error: readError } = await db.from('bill_items').select('id, picked_at, picked_by, hq_ship_qty').eq('id', itemId).single();
  if (readError) throw fromDbError(readError);
  return NextResponse.json({ item: data });
});
