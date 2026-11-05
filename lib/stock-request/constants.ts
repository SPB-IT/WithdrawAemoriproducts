import type { AuditAction, BillStatus } from './types';

export const SR_BUCKET = 'stock-request-photos';
export const SR_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
export const SR_HISTORY_LIMIT = 3;

export const SR_BRANCH_COOKIE = 'sr_branch';
export const SR_RECENT_STAFF_KEY = 'sr_recent_staff';

export const SR_HQ_HOME = '/admin/stock-request';
export const SR_HQ_API = '/admin/stock-request/api';
/** ชื่อโปรไฟล์กลางที่ใช้บันทึกผู้ตัดบิล/ผู้จัดส่ง/ผู้แก้ไข (เข้าด้วยรหัสกลางเดิม ไม่ต้องเลือกชื่อ) */
export const SR_SHARED_ADMIN_NAME = 'ผู้ดูแลระบบ';

export const STATUS_LABEL: Record<BillStatus, string> = {
  pending: 'รอตัดบิล',
  billed: 'ตัดบิลแล้ว',
  shipped: 'จัดส่งแล้ว',
  received: 'ได้รับสินค้าแล้ว',
};

export const STATUS_ORDER: BillStatus[] = ['pending', 'billed', 'shipped', 'received'];

export const STATUS_STYLE: Record<BillStatus, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  billed: 'bg-sky-50 text-sky-700 ring-sky-200',
  shipped: 'bg-violet-50 text-violet-700 ring-violet-200',
  received: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
};

export const AUDIT_ACTION_LABEL: Record<AuditAction, string> = {
  item_add: 'เพิ่มสินค้า',
  item_update: 'แก้ไขรายละเอียดสินค้า',
  item_remove: 'ลบสินค้า',
  item_restore: 'นำสินค้ากลับมา',
  ship_qty_change: 'เปลี่ยนจำนวนจัดส่ง',
  substitution_set: 'กำหนดสินค้าทดแทน',
  substitution_remove: 'ยกเลิกสินค้าทดแทน',
  note_update: 'แก้ไขหมายเหตุ',
  bill_cut: 'ตัดบิล',
  status_change: 'เปลี่ยนสถานะ',
};

export const FIELD_LABEL: Record<string, string> = {
  product_name: 'ชื่อสินค้า',
  product_code: 'รหัสสินค้า',
  stock_on_hand: 'จำนวนที่สั่ง',
  hq_ship_qty: 'จำนวนจัดส่ง',
  hq_note: 'หมายเหตุ HQ',
  staff_note: 'หมายเหตุสาขา',
  photo_path: 'รูปสินค้า',
  is_removed: 'ถูกลบ',
  status: 'สถานะ',
  item_count: 'จำนวนรายการ',
  ship_qty: 'จำนวนจัดส่ง',
  reason: 'เหตุผล',
};
