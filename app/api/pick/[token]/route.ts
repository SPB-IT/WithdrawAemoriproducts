import { NextRequest, NextResponse } from 'next/server';
import { getSharedAdminProfile } from '@/lib/stock-request/admin-auth';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { packItem, withBillVersion } from '@/lib/stock-request/packing';
import { resolvePickLink } from '@/lib/stock-request/pick-links';
import { isPartial, parseShortReason } from '@/lib/stock-request/qty';
import { assertPhotoUploaded, getBillRow, loadBillDetails, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';
import { isUuid, optionalInt, optionalText, readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลิงก์หยิบของ (ไม่ต้องเข้าระบบ — สิทธิ์มาจากรหัสลิงก์ ใช้ได้กับบิลเดียว)
// GET: รายการสินค้าในบิล · POST: บันทึกผลการหยิบ
//   หยิบได้ครบ / ได้ไม่ครบ (จำนวน + เหตุผล) / ใช้ของแทน (+ เหตุผล) / ไม่มีของ (+ หมายเหตุ)

type Context = { params: Promise<{ token: string }> };
type PickState = 'picked' | 'partial' | 'missing' | 'substitute';

async function loadPickBill(token: string) {
  const link = await resolvePickLink(token);
  const bill = await getBillRow(link.bill_id);
  if (bill.status !== 'billed') throw new ApiError(410, 'SR_LINK_DONE', bill.status === 'pending' ? 'บิลนี้ยังไม่ถูกตัด' : 'บิลนี้จัดส่งแล้ว ลิงก์หยิบของใช้ไม่ได้แล้ว');
  const [detail] = await loadBillDetails([bill], { audit: 'after_billing' });
  return { link, detail };
}

/** เหตุผลล่าสุดของการกระทำนั้นกับรายการ (หลังตัดบิล) */
function latestReason(detail: BillDetail, item: BillItemDetail, action: string) {
  const log = detail.audit_logs.filter((entry) => entry.bill_item_id === item.id && entry.action === action).sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return log?.after_billing ? log.reason ?? '' : undefined;
}

export const GET = handle(async (_request: NextRequest, context: Context) => {
  const { link, detail } = await loadPickBill((await context.params).token);
  const items = detail.items
    .map((item) => {
      const removedNote = item.is_removed ? latestReason(detail, item, 'item_remove') : null;
      if (item.is_removed && removedNote === undefined) return null; // นำออกก่อนตัดบิล ไม่ต้องหยิบ
      const partial = !item.is_removed && item.picked_at && isPartial(item);
      return {
        id: item.id,
        product_name: item.substitution?.product_name ?? item.product_name,
        product_code: item.substitution?.product_code ?? item.product_code,
        replaced: item.substitution ? item.product_name : null,
        stock_on_hand: item.stock_on_hand,
        sent_qty: partial ? item.hq_ship_qty : null,
        photo_url: item.substitution?.photo_url ?? item.photo_url,
        state: (item.is_removed ? 'missing' : partial ? 'partial' : item.picked_at ? 'picked' : null) as PickState | null,
        note: item.is_removed ? removedNote ?? null : partial ? parseShortReason(latestReason(detail, item, 'ship_qty_change'))?.reason ?? null : null,
        by: item.is_removed ? null : item.picked_by,
      };
    })
    .filter((item) => item !== null);
  return NextResponse.json({
    bill: { bill_no: detail.bill_no, branch_name: detail.branch_name, billed_at: detail.billed_at, responsible_name: detail.responsible_name },
    items,
    expires_at: link.expires_at,
    last_saved_at: link.last_saved_at,
    last_saved_by: link.last_saved_by,
  });
});

export const POST = handle(async (request: NextRequest, context: Context) => {
  const { link, detail } = await loadPickBill((await context.params).token);
  const body = await readJson(request);
  const pickerName = requireText(body.pickerName, 100, 'ชื่อผู้หยิบของ');
  const entries = Array.isArray(body.items)
    ? (body.items as { itemId?: unknown; state?: unknown; note?: unknown; qty?: unknown; productName?: unknown; productCode?: unknown; photoPath?: unknown }[])
    : [];
  if (entries.length === 0) throw new ApiError(400, 'SR_INVALID_INPUT', 'ยังไม่ได้เลือกรายการ');

  const byId = new Map(detail.items.map((item) => [item.id, item]));
  const states: PickState[] = ['picked', 'partial', 'missing', 'substitute'];
  const plans = entries.map((entry) => {
    const item = isUuid(entry.itemId) ? byId.get(String(entry.itemId).toLowerCase()) : undefined;
    if (!item || !states.includes(entry.state as PickState)) throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลรายการไม่ถูกต้อง');
    const state = entry.state as PickState;
    const note = state === 'picked' ? optionalText(entry.note, 300) : requireText(entry.note, 300, `เหตุผล “${item.product_name}”`);
    const qty = state === 'partial' ? optionalInt(entry.qty, `จำนวนที่หยิบได้ของ “${item.product_name}”`) : null;
    if (state === 'partial' && qty === null) throw new ApiError(400, 'SR_INVALID_INPUT', `กรุณาใส่จำนวนที่หยิบได้ของ “${item.product_name}”`);
    const substitute =
      state === 'substitute'
        ? {
            name: requireText(entry.productName, 200, `ชื่อสินค้าทดแทนของ “${item.product_name}”`),
            code: requireText(entry.productCode, 100, `รหัสสินค้าทดแทนของ “${item.product_name}”`),
            photoPath: optionalText(entry.photoPath, 200),
          }
        : null;
    if (substitute?.photoPath && !substitute.photoPath.startsWith(`${detail.branch_id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
    return { item, state, note, qty, substitute };
  });
  for (const plan of plans) if (plan.substitute?.photoPath) await assertPhotoUploaded(plan.substitute.photoPath);

  const admin = await getSharedAdminProfile();
  const db = getServiceClient();
  // แก้รายการผ่านฟังก์ชันเดิมของ HQ (บันทึก Audit Log + แจ้งสาขา)
  const setRemoved = (itemId: string, removed: boolean, reason: string) =>
    withBillVersion(detail.id, (version) => rpc('hq_set_item_removed', { p_admin_id: admin.id, p_item_id: itemId, p_expected_version: version, p_removed: removed, p_reason: reason }));
  const pack = (item: BillItemDetail, qty: number | null, reason: string | null) => packItem({ adminId: admin.id, billId: detail.id, item, packerName: pickerName, qty, reason });

  const counts = { picked: 0, partial: 0, missing: 0, substituted: 0 };
  for (const { item, state, note, qty, substitute } of plans) {
    if (state === 'picked' || state === 'partial') {
      if (item.is_removed) await setRemoved(item.id, false, `หยิบได้ (ลิงก์หยิบของ) · ผู้หยิบ: ${pickerName}`);
      await pack(item, state === 'partial' ? qty : null, note);
      counts[state] += 1;
    } else if (state === 'substitute' && substitute) {
      // ใช้ของแทน = บันทึกสินค้าทดแทน (เก็บประวัติ) แล้วถือว่าหยิบได้ครบ
      if (item.is_removed) await setRemoved(item.id, false, `ใช้สินค้าทดแทน (ลิงก์หยิบของ) · ผู้หยิบ: ${pickerName}`);
      await withBillVersion(detail.id, (version) =>
        rpc('hq_set_substitution', {
          p_admin_id: admin.id,
          p_item_id: item.id,
          p_expected_version: version,
          p_product_name: substitute.name,
          p_product_code: substitute.code,
          p_ship_qty: 0,
          p_photo_path: substitute.photoPath,
          p_reason: `${note} · ผู้หยิบ: ${pickerName}`,
        }),
      );
      await pack(item, null, null);
      counts.substituted += 1;
    } else {
      if (!item.is_removed) await setRemoved(item.id, true, `ไม่มีของ: ${note} · ผู้หยิบ: ${pickerName}`);
      counts.missing += 1;
    }
  }

  const now = new Date().toISOString();
  const [linkUpdate, notify] = await Promise.all([
    db.from('pick_links').update({ last_saved_at: now, last_saved_by: pickerName }).eq('id', link.id),
    db.from('notifications').insert({
      audience: 'hq',
      branch_id: detail.branch_id,
      bill_id: detail.id,
      type: 'pick_saved',
      title: 'บันทึกการหยิบของแล้ว',
      body: `${detail.branch_name} · บิล ${detail.bill_no}: หยิบได้ครบ ${counts.picked} · ได้ไม่ครบ ${counts.partial} · ใช้ของแทน ${counts.substituted} · ไม่มี ${counts.missing} (โดย ${pickerName})`,
    }),
  ]);
  if (linkUpdate.error) console.error('[stock-request] pick link save', linkUpdate.error.message);
  if (notify.error) console.error('[stock-request] pick notify', notify.error.message);
  return NextResponse.json({ ok: true, ...counts });
});
