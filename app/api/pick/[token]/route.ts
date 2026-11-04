import { NextRequest, NextResponse } from 'next/server';
import { getSharedAdminProfile } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { resolvePickLink } from '@/lib/stock-request/pick-links';
import { getBillRow, loadBillDetails, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';
import { isUuid, optionalText, readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลิงก์หยิบของ (ไม่ต้องเข้าระบบ — สิทธิ์มาจากรหัสลิงก์ ใช้ได้กับบิลเดียว)
// GET: รายการสินค้าในบิล · POST: บันทึกผลการหยิบ (หยิบได้ / ไม่มีของ + หมายเหตุ)

type Context = { params: Promise<{ token: string }> };
type PickState = 'picked' | 'missing';

async function loadPickBill(token: string) {
  const link = await resolvePickLink(token);
  const bill = await getBillRow(link.bill_id);
  if (bill.status !== 'billed') throw new ApiError(410, 'SR_LINK_DONE', bill.status === 'pending' ? 'บิลนี้ยังไม่ถูกตัด' : 'บิลนี้จัดส่งแล้ว ลิงก์หยิบของใช้ไม่ได้แล้ว');
  const [detail] = await loadBillDetails([bill], { audit: 'after_billing' });
  return { link, detail };
}

/** เหตุผลล่าสุดที่รายการถูกนำออกหลังตัดบิล (= กด "ไม่มีของ") — ถ้าถูกนำออกก่อนตัดบิล คืน undefined */
function removedAfterBilling(detail: BillDetail, item: BillItemDetail) {
  const log = detail.audit_logs
    .filter((entry) => entry.bill_item_id === item.id && entry.action === 'item_remove')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return log?.after_billing ? log.reason ?? '' : undefined;
}

export const GET = handle(async (_request: NextRequest, context: Context) => {
  const { link, detail } = await loadPickBill((await context.params).token);
  const items = detail.items
    .map((item) => {
      const removedNote = item.is_removed ? removedAfterBilling(detail, item) : null;
      if (item.is_removed && removedNote === undefined) return null; // นำออกก่อนตัดบิล ไม่ต้องหยิบ
      return {
        id: item.id,
        product_name: item.substitution?.product_name ?? item.product_name,
        product_code: item.substitution?.product_code ?? item.product_code,
        replaced: item.substitution ? item.product_name : null,
        stock_on_hand: item.stock_on_hand,
        photo_url: item.substitution?.photo_url ?? item.photo_url,
        state: (item.is_removed ? 'missing' : item.picked_at ? 'picked' : null) as PickState | null,
        note: removedNote ?? null,
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
  const entries = Array.isArray(body.items) ? (body.items as { itemId?: unknown; state?: unknown; note?: unknown }[]) : [];
  if (entries.length === 0) throw new ApiError(400, 'SR_INVALID_INPUT', 'ยังไม่ได้เลือกรายการ');

  const byId = new Map(detail.items.map((item) => [item.id, item]));
  const plans = entries.map((entry) => {
    const item = isUuid(entry.itemId) ? byId.get(String(entry.itemId).toLowerCase()) : undefined;
    if (!item || (entry.state !== 'picked' && entry.state !== 'missing')) throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลรายการไม่ถูกต้อง');
    const note = entry.state === 'missing' ? requireText(entry.note, 300, `หมายเหตุ “${item.product_name}”`) : optionalText(entry.note, 300);
    return { item, state: entry.state as PickState, note };
  });

  const admin = await getSharedAdminProfile();
  const db = getServiceClient();
  // นำออก/นำกลับรายการผ่านฟังก์ชันเดิม (บันทึก Audit Log + แจ้งสาขา) · อ่านเวอร์ชันบิลล่าสุดทุกครั้ง ชนกันลองใหม่
  const setRemoved = async (itemId: string, removed: boolean, reason: string) => {
    for (let attempt = 1; ; attempt += 1) {
      const { data, error } = await db.from('bills').select('version').eq('id', detail.id).single();
      if (error) throw fromDbError(error);
      try {
        await rpc('hq_set_item_removed', { p_admin_id: admin.id, p_item_id: itemId, p_expected_version: data.version, p_removed: removed, p_reason: reason });
        return;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SR_VERSION_CONFLICT' && attempt < 3) continue;
        throw err;
      }
    }
  };

  let picked = 0;
  let missing = 0;
  for (const { item, state, note } of plans) {
    if (state === 'picked') {
      if (item.is_removed) await setRemoved(item.id, false, `หยิบได้ (ลิงก์หยิบของ) · ผู้หยิบ: ${pickerName}`);
      const { error } = await db.from('bill_items').update({ picked_at: new Date().toISOString(), picked_by: pickerName }).eq('id', item.id).eq('bill_id', detail.id);
      if (error) throw fromDbError(error);
      picked += 1;
    } else {
      if (!item.is_removed) await setRemoved(item.id, true, `ไม่มีของ: ${note} · ผู้หยิบ: ${pickerName}`);
      missing += 1;
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
      body: `${detail.branch_name} · บิล ${detail.bill_no}: หยิบได้ ${picked} · ไม่มี ${missing} (โดย ${pickerName})`,
    }),
  ]);
  if (linkUpdate.error) console.error('[stock-request] pick link save', linkUpdate.error.message);
  if (notify.error) console.error('[stock-request] pick notify', notify.error.message);
  return NextResponse.json({ ok: true, picked, missing });
});
