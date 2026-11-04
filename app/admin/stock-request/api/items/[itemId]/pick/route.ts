import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ติ๊ก/ยกเลิกติ๊ก "แพ็คแล้ว" ในหน้าแพ็คของ — ได้เฉพาะบิลที่ตัดแล้วและยังไม่จัดส่ง
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  await requireAdmin();
  const itemId = requireUuid((await context.params).itemId, 'รหัสรายการ');
  const body = await readJson(request);
  const { picked } = body;
  if (typeof picked !== 'boolean') throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลไม่ถูกต้อง');
  // ชื่อคนที่ไปเช็คของ (ลงชื่อในหน้าเช็คของ)
  const pickerName = picked ? requireText(body.pickerName, 100, 'ชื่อผู้แพ็คของ') : null;

  const db = getServiceClient();
  const { data: item, error } = await db.from('bill_items').select('bill_id, is_removed, bills(status)').eq('id', itemId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!item || item.is_removed) throw new ApiError(404, 'SR_ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  const status = (item.bills as unknown as { status: string } | null)?.status;
  if (status !== 'billed') throw new ApiError(409, 'SR_NOT_PICKABLE', 'แพ็คของได้เฉพาะบิลที่ตัดแล้วและยังไม่จัดส่ง');

  const patch = picked ? { picked_at: new Date().toISOString(), picked_by: pickerName } : { picked_at: null, picked_by: null };
  const { data, error: updateError } = await db.from('bill_items').update(patch).eq('id', itemId).select('id, picked_at, picked_by').single();
  if (updateError) throw fromDbError(updateError);
  return NextResponse.json({ item: data });
});
