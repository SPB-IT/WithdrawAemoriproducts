import { NextRequest, NextResponse } from 'next/server';
import { getSharedAdminProfile } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { resolvePickLink } from '@/lib/stock-request/pick-links';
import { assertPhotoUploaded, getBillRow, loadBillDetails, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';
import { isUuid, optionalText, readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลิงก์หยิบของ (ไม่ต้องเข้าระบบ — สิทธิ์มาจากรหัสลิงก์ ใช้ได้กับบิลเดียว)
// GET: รายการสินค้าในบิล · POST: บันทึกผลการหยิบ (หยิบได้ / ใช้ของแทน + เหตุผล / ไม่มีของ + หมายเหตุ)

type Context = { params: Promise<{ token: string }> };
type PickState = 'picked' | 'missing' | 'substitute';

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
  const entries = Array.isArray(body.items)
    ? (body.items as { itemId?: unknown; state?: unknown; note?: unknown; productName?: unknown; productCode?: unknown; photoPath?: unknown }[])
    : [];
  if (entries.length === 0) throw new ApiError(400, 'SR_INVALID_INPUT', 'ยังไม่ได้เลือกรายการ');

  const byId = new Map(detail.items.map((item) => [item.id, item]));
  const plans = entries.map((entry) => {
    const item = isUuid(entry.itemId) ? byId.get(String(entry.itemId).toLowerCase()) : undefined;
    if (!item || (entry.state !== 'picked' && entry.state !== 'missing' && entry.state !== 'substitute')) throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลรายการไม่ถูกต้อง');
    const needsNote = entry.state === 'missing' || entry.state === 'substitute';
    const note = needsNote ? requireText(entry.note, 300, `เหตุผล “${item.product_name}”`) : optionalText(entry.note, 300);
    const substitute =
      entry.state === 'substitute'
        ? {
            name: requireText(entry.productName, 200, `ชื่อสินค้าทดแทนของ “${item.product_name}”`),
            code: requireText(entry.productCode, 100, `รหัสสินค้าทดแทนของ “${item.product_name}”`),
            photoPath: optionalText(entry.photoPath, 200),
          }
        : null;
    if (substitute?.photoPath && !substitute.photoPath.startsWith(`${detail.branch_id}/`)) throw new ApiError(400, 'SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
    return { item, state: entry.state as PickState, note, substitute };
  });
  for (const plan of plans) if (plan.substitute?.photoPath) await assertPhotoUploaded(plan.substitute.photoPath);

  const admin = await getSharedAdminProfile();
  const db = getServiceClient();
  // แก้รายการผ่านฟังก์ชันเดิมของ HQ (บันทึก Audit Log + แจ้งสาขา) · อ่านเวอร์ชันบิลล่าสุดทุกครั้ง ชนกันลองใหม่
  const withVersion = async (call: (version: number) => Promise<unknown>) => {
    for (let attempt = 1; ; attempt += 1) {
      const { data, error } = await db.from('bills').select('version').eq('id', detail.id).single();
      if (error) throw fromDbError(error);
      try {
        await call(data.version);
        return;
      } catch (err) {
        if (err instanceof ApiError && err.code === 'SR_VERSION_CONFLICT' && attempt < 3) continue;
        throw err;
      }
    }
  };
  const setRemoved = (itemId: string, removed: boolean, reason: string) =>
    withVersion((version) => rpc('hq_set_item_removed', { p_admin_id: admin.id, p_item_id: itemId, p_expected_version: version, p_removed: removed, p_reason: reason }));
  const markPicked = async (itemId: string) => {
    const { error } = await db.from('bill_items').update({ picked_at: new Date().toISOString(), picked_by: pickerName }).eq('id', itemId).eq('bill_id', detail.id);
    if (error) throw fromDbError(error);
  };

  let picked = 0;
  let missing = 0;
  let substituted = 0;
  for (const { item, state, note, substitute } of plans) {
    if (state === 'picked') {
      if (item.is_removed) await setRemoved(item.id, false, `หยิบได้ (ลิงก์หยิบของ) · ผู้หยิบ: ${pickerName}`);
      await markPicked(item.id);
      picked += 1;
    } else if (state === 'substitute' && substitute) {
      // ใช้ของแทน = บันทึกสินค้าทดแทน (เก็บประวัติ) แล้วถือว่าหยิบได้
      if (item.is_removed) await setRemoved(item.id, false, `ใช้สินค้าทดแทน (ลิงก์หยิบของ) · ผู้หยิบ: ${pickerName}`);
      await withVersion((version) =>
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
      await markPicked(item.id);
      substituted += 1;
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
      body: `${detail.branch_name} · บิล ${detail.bill_no}: หยิบได้ ${picked} · ใช้ของแทน ${substituted} · ไม่มี ${missing} (โดย ${pickerName})`,
    }),
  ]);
  if (linkUpdate.error) console.error('[stock-request] pick link save', linkUpdate.error.message);
  if (notify.error) console.error('[stock-request] pick notify', notify.error.message);
  return NextResponse.json({ ok: true, picked, missing, substituted });
});
