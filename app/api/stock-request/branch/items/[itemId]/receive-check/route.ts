import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { optionalText, readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// สาขาเช็คของที่ได้รับทีละรายการ: ok = ได้รับ · missing = ไม่ได้รับ/ไม่ครบ (ต้องมีหมายเหตุ) · null = ยกเลิกเช็ค
// ทำได้เฉพาะบิลที่ HQ จัดส่งแล้วและสาขายังไม่ยืนยันรับ
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const branch = await requireBranchContext(request);
  const itemId = requireUuid((await context.params).itemId, 'รหัสรายการ');
  const body = await readJson(request);
  const state = body.state;
  if (state !== 'ok' && state !== 'missing' && state !== null) throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลไม่ถูกต้อง');
  const note = optionalText(body.note, 500);
  if (state === 'missing' && !note) throw new ApiError(400, 'SR_INVALID_INPUT', 'กรุณาระบุหมายเหตุว่าไม่ได้รับหรือขาดอะไร');
  const staffName = state ? requireText(body.staffName, 100, 'ชื่อผู้เช็คของ') : null;

  const db = getServiceClient();
  const { data: item, error } = await db.from('bill_items').select('branch_id, is_removed, bills(status)').eq('id', itemId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!item || item.branch_id !== branch.id || item.is_removed) throw new ApiError(404, 'SR_ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  const status = (item.bills as unknown as { status: string } | null)?.status;
  if (status !== 'shipped') throw new ApiError(409, 'SR_NOT_CHECKABLE', 'เช็คของได้หลังสำนักงานใหญ่จัดส่ง และก่อนกดยืนยันรับสินค้า');

  const patch = state
    ? { received_state: state, received_note: state === 'missing' ? note : null, received_checked_by: staffName, received_checked_at: new Date().toISOString() }
    : { received_state: null, received_note: null, received_checked_by: null, received_checked_at: null };
  const { data, error: updateError } = await db
    .from('bill_items')
    .update(patch)
    .eq('id', itemId)
    .select('id, received_state, received_note, received_checked_by, received_checked_at')
    .single();
  if (updateError) throw fromDbError(updateError);
  return NextResponse.json({ item: data });
});
