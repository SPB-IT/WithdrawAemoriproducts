import type { BillItemRow } from './types';

// จำนวนสินค้าในบิล (ใช้ได้ทั้งฝั่ง client และ server)
// - stock_on_hand = จำนวนที่สาขาสั่ง (ชื่อคอลัมน์เดิม)
// - hq_ship_qty   = จำนวนที่ส่งจริง เมื่อคลังมีไม่พอ · ว่าง = ส่งครบตามที่สั่ง
type QtyFields = Pick<BillItemRow, 'stock_on_hand' | 'hq_ship_qty'>;

export const orderedQty = (item: QtyFields) => item.stock_on_hand;

export const sentQty = (item: QtyFields) => item.hq_ship_qty ?? item.stock_on_hand;

/** จำนวนที่ขาด (สั่ง − ส่งจริง) · 0 = ส่งครบ */
export function shortQty(item: QtyFields) {
  if (item.hq_ship_qty === null || item.stock_on_hand === null) return 0;
  return Math.max(0, item.stock_on_hand - item.hq_ship_qty);
}

export const isPartial = (item: QtyFields) => shortQty(item) > 0;

/** แยกเหตุผลจากบันทึกประวัติ "ของไม่พอ ส่งได้ 4/10: <เหตุผล> · ผู้แพ็ค: <ชื่อ>" */
export function parseShortReason(text: string | null | undefined): { reason: string; packer: string | null } | null {
  if (!text) return null;
  const match = /^ของไม่พอ ส่งได้ \d+\/\d+: (.*?)(?: · ผู้แพ็ค: (.*))?$/.exec(text);
  return match ? { reason: match[1], packer: match[2] ?? null } : { reason: text, packer: null };
}

/** คำนำหน้าใน "หมายเหตุ HQ" เมื่อแอดมินตัดสินใจเรื่องส่วนที่ขาดแล้ว (ยกยอด / ไม่ยกยอด) */
export const SHORTFALL_NOTE_PREFIX = 'ส่วนที่ขาด:';

/** ส่วนที่ขาดได้รับการจัดการแล้วหรือยัง */
export const shortfallHandled = (item: { hq_note: string | null }) => Boolean(item.hq_note?.includes(SHORTFALL_NOTE_PREFIX));
