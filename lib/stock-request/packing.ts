import 'server-only';
import { ApiError, fromDbError } from './errors';
import { rpc } from './queries';
import { getServiceClient } from './supabase-admin';
import type { BillItemRow } from './types';

/** เรียกฟังก์ชันแก้บิลด้วยเวอร์ชันล่าสุด · ชนกับคนอื่นพอดีให้ลองใหม่ (สูงสุด 3 ครั้ง) */
export async function withBillVersion(billId: string, call: (version: number) => Promise<unknown>) {
  const db = getServiceClient();
  for (let attempt = 1; ; attempt += 1) {
    const { data, error } = await db.from('bills').select('version').eq('id', billId).single();
    if (error) throw fromDbError(error);
    try {
      return await call(data.version);
    } catch (err) {
      if (err instanceof ApiError && err.code === 'SR_VERSION_CONFLICT' && attempt < 3) continue;
      throw err;
    }
  }
}

/**
 * แพ็ครายการ: ติ๊กแพ็คแล้ว + บันทึกจำนวนที่ส่งจริง
 * - qty = null → ส่งครบตามที่สั่ง (ถ้าเคยบันทึกว่าส่งไม่ครบ จะล้างกลับเป็นครบ)
 * - qty = ตัวเลข → ของไม่พอ ส่งได้แค่นี้ (1 ถึง สั่ง−1) ต้องมีเหตุผล · บันทึกประวัติ + แจ้งสาขาผ่าน hq_update_item
 */
export async function packItem(params: {
  adminId: string;
  billId: string;
  item: Pick<BillItemRow, 'id' | 'product_name' | 'stock_on_hand' | 'hq_ship_qty'>;
  packerName: string;
  qty: number | null;
  reason?: string | null;
}) {
  const { adminId, billId, item, packerName, qty, reason } = params;
  const ordered = item.stock_on_hand;

  if (qty !== null) {
    if (ordered === null) throw new ApiError(400, 'SR_INVALID_INPUT', `“${item.product_name}” ไม่มีจำนวนที่สั่ง จึงบันทึกว่าส่งไม่ครบไม่ได้`);
    if (!Number.isInteger(qty) || qty < 1 || qty >= ordered) {
      throw new ApiError(400, 'SR_INVALID_INPUT', `จำนวนที่ส่งได้ของ “${item.product_name}” ต้องอยู่ระหว่าง 1 ถึง ${ordered - 1} (ถ้าไม่มีเลยให้เลือก “ไม่มีของ”)`);
    }
    if (!reason?.trim()) throw new ApiError(400, 'SR_INVALID_INPUT', `กรุณาระบุเหตุผลที่ส่ง “${item.product_name}” ไม่ครบ`);
  }

  if (qty !== item.hq_ship_qty) {
    const note = qty === null ? `ส่งครบตามที่สั่ง` : `ของไม่พอ ส่งได้ ${qty}/${ordered}: ${reason!.trim()}`;
    await withBillVersion(billId, (version) =>
      rpc('hq_update_item', {
        p_admin_id: adminId,
        p_item_id: item.id,
        p_expected_version: version,
        p_patch: { hq_ship_qty: qty },
        p_reason: `${note} · ผู้แพ็ค: ${packerName}`.slice(0, 1000),
      }),
    );
  }

  const { error } = await getServiceClient().from('bill_items').update({ picked_at: new Date().toISOString(), picked_by: packerName }).eq('id', item.id).eq('bill_id', billId);
  if (error) throw fromDbError(error);
}
