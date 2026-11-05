import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { withBillVersion } from '@/lib/stock-request/packing';
import { SHORTFALL_NOTE_PREFIX, sentQty, shortQty } from '@/lib/stock-request/qty';
import { copyItemPhoto, getBillRow, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillItemRow, BillRow } from '@/lib/stock-request/types';
import { optionalText, readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ของไม่พอ: แอดมินเลือกจัดการจำนวนที่ขาดทีละรายการ
//   same       → ยกยอดสินค้าเดิมไปบิลถัดไปของสาขา
//   substitute → ยกยอดเป็นสินค้าทดแทน (ชื่อ/รหัส) ไปบิลถัดไป
//   none       → ไม่ยกยอด (ต้องมีเหตุผล)
// ผลการตัดสินใจบันทึกต่อท้าย "หมายเหตุ HQ" ของรายการเดิม (ผ่าน hq_update_item → ประวัติ + แจ้งสาขา) และกันทำซ้ำ
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ itemId: string }> }) => {
  const admin = await requireAdmin();
  const itemId = requireUuid((await context.params).itemId, 'รหัสรายการ');
  const body = await readJson(request);
  const mode = body.mode ?? 'same';
  if (mode !== 'same' && mode !== 'substitute' && mode !== 'none') throw new ApiError(400, 'SR_INVALID_INPUT', 'รูปแบบการจัดการไม่ถูกต้อง');

  const db = getServiceClient();
  const { data, error } = await db.from('bill_items').select('*, item_substitutions(*)').eq('id', itemId).maybeSingle();
  if (error) throw fromDbError(error);
  const item = data as (BillItemRow & { item_substitutions: { is_active: boolean; product_name: string; product_code: string; photo_path: string | null }[] }) | null;
  if (!item || item.is_removed) throw new ApiError(404, 'SR_ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  const short = shortQty(item);
  if (short < 1) throw new ApiError(409, 'SR_NOT_SHORT', 'รายการนี้ส่งครบแล้ว ไม่มีจำนวนที่ต้องจัดการ');
  if (item.hq_note?.includes(SHORTFALL_NOTE_PREFIX)) throw new ApiError(409, 'SR_ALREADY_CARRIED', 'จัดการส่วนที่ขาดของรายการนี้ไปแล้ว');
  const bill = await getBillRow(item.bill_id);
  if (bill.status === 'pending') throw new ApiError(409, 'SR_NOT_SHORT', 'บิลนี้ยังไม่ถูกตัด');

  // สิ่งที่ควรได้รับจริง (ถ้าเปลี่ยนเป็นสินค้าทดแทนแล้ว ใช้ตัวทดแทน)
  const current = item.item_substitutions?.find((row) => row.is_active);
  const reason = optionalText(body.reason, 300);
  let decision: string;
  let carriedTo: string | null = null;

  if (mode === 'none') {
    if (!reason) throw new ApiError(400, 'SR_INVALID_INPUT', 'กรุณาระบุเหตุผลที่ไม่ยกยอด');
    decision = `${SHORTFALL_NOTE_PREFIX} ไม่ยกยอด ${short} ชิ้น — ${reason}`;
  } else {
    const name = mode === 'substitute' ? requireText(body.productName, 200, 'ชื่อสินค้าทดแทน') : current?.product_name ?? item.product_name;
    const code = mode === 'substitute' ? requireText(body.productCode, 100, 'รหัสสินค้าทดแทน') : current?.product_code ?? item.product_code;
    const photo = mode === 'same' ? await copyItemPhoto(current?.photo_path ?? item.photo_path, bill.branch_id) : null;
    const open = await rpc<BillRow>('get_or_open_bill', { p_branch_id: bill.branch_id });
    const origin = current?.product_name ?? item.product_name;
    await withBillVersion(open.id, (version) =>
      rpc('hq_add_item', {
        p_admin_id: admin.id,
        p_bill_id: open.id,
        p_expected_version: version,
        p_item_id: crypto.randomUUID(),
        p_product_name: name,
        p_product_code: code,
        p_stock_on_hand: short, // จำนวนที่สั่งในบิลใหม่ = จำนวนที่ขาด
        p_hq_ship_qty: null,
        p_hq_note: `ยกยอดส่วนที่ขาดจากบิล ${bill.bill_no} (ส่งได้ ${sentQty(item)}/${item.stock_on_hand})${mode === 'substitute' ? ` · ใช้แทน ${origin}` : ''}${reason ? ` · ${reason}` : ''}`,
        p_photo_path: photo,
        p_reason: null,
      }),
    );
    carriedTo = open.bill_no;
    decision = `${SHORTFALL_NOTE_PREFIX} ยกยอด ${short} ชิ้นไปบิล ${open.bill_no}${mode === 'substitute' ? ` เป็น ${name} (${code})` : ''}`;
  }

  // บันทึกการตัดสินใจบนรายการเดิม (กันทำซ้ำ + ประวัติ + แจ้งสาขา)
  const hqNote = [item.hq_note, decision].filter(Boolean).join(' · ').slice(0, 1000);
  await withBillVersion(bill.id, (version) =>
    rpc('hq_update_item', { p_admin_id: admin.id, p_item_id: item.id, p_expected_version: version, p_patch: { hq_note: hqNote }, p_reason: decision }),
  );
  return NextResponse.json({ ok: true, mode, carriedTo, qty: short, decision });
});
