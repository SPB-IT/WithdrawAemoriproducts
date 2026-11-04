export type BillStatus = 'pending' | 'billed' | 'shipped' | 'received';

export type AuditAction =
  | 'item_add'
  | 'item_update'
  | 'item_remove'
  | 'item_restore'
  | 'ship_qty_change'
  | 'substitution_set'
  | 'substitution_remove'
  | 'note_update'
  | 'bill_cut'
  | 'status_change';

export type JsonObject = Record<string, unknown>;

export interface Branch {
  id: number;
  name: string;
}

export interface AdminProfile {
  id: string;
  display_name: string;
  email: string | null;
  role: 'admin' | 'super_admin';
  is_active: boolean;
}

export interface BillRow {
  id: string;
  bill_no: string;
  branch_id: number;
  status: BillStatus;
  version: number;
  billed_at: string | null;
  billed_by: string | null;
  /** ชื่อผู้รับผิดชอบบิล (กรอกตอนตัดบิล) */
  responsible_name: string | null;
  /** ชื่อผู้จัดส่ง (กรอกตอนยืนยันจัดส่ง) */
  shipped_name: string | null;
  /** ปัญหาหลังรับของ: open = สาขาแจ้งของไม่ครบ รอแก้ไข · resolved = ผู้ดูแลปิดเรื่องแล้ว */
  issue_status: 'open' | 'resolved' | null;
  issue_summary: string | null;
  issue_opened_at: string | null;
  issue_resolved_note: string | null;
  issue_resolved_by: string | null;
  issue_resolved_at: string | null;
  shipped_at: string | null;
  shipped_by: string | null;
  received_at: string | null;
  received_by_name: string | null;
  created_at: string;
  updated_at: string;
}

export interface BillItemRow {
  id: string;
  bill_id: string;
  branch_id: number;
  product_name: string;
  product_code: string;
  stock_on_hand: number | null;
  staff_note: string | null;
  photo_path: string | null;
  reported_by_name: string;
  source: 'branch' | 'hq';
  created_by_admin: string | null;
  hq_ship_qty: number | null;
  hq_note: string | null;
  picked_at: string | null;
  picked_by: string | null;
  /** ผลเช็คของฝั่งสาขาหลังได้รับ: null=ยังไม่เช็ค · ok=ได้รับ · missing=ไม่ได้รับ/ไม่ครบ */
  received_state: 'ok' | 'missing' | null;
  received_note: string | null;
  received_checked_by: string | null;
  received_checked_at: string | null;
  is_removed: boolean;
  removed_at: string | null;
  removed_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SubstitutionRow {
  id: string;
  bill_item_id: string;
  product_name: string;
  product_code: string;
  photo_path: string | null;
  ship_qty: number;
  reason: string;
  is_active: boolean;
  created_by: string;
  created_at: string;
  deactivated_at: string | null;
}

export interface AuditLogRow {
  id: string;
  bill_id: string;
  bill_item_id: string | null;
  admin_id: string | null; // null = การกระทำของสาขา (admin_name = "สาขา · ชื่อ")
  admin_name: string;
  action: AuditAction;
  before_data: JsonObject | null;
  after_data: JsonObject | null;
  reason: string | null;
  after_billing: boolean;
  created_at: string;
}

export interface StatusLogRow {
  id: string;
  bill_id: string;
  from_status: BillStatus | null;
  to_status: BillStatus;
  admin_id: string | null;
  actor_name: string;
  changed_at: string;
}

export interface NotificationRow {
  id: string;
  audience: 'hq' | 'branch';
  branch_id: number | null;
  bill_id: string | null;
  type: string;
  title: string;
  body: string | null;
  branch_read_at: string | null;
  created_at: string;
}

export interface SubstitutionDetail extends SubstitutionRow {
  photo_url: string | null;
  created_by_name: string | null;
}

export interface BillItemDetail extends BillItemRow {
  photo_url: string | null;
  substitution: SubstitutionDetail | null;
  substitution_history: SubstitutionDetail[];
}

export interface BillDetail extends BillRow {
  branch_name: string;
  billed_by_name: string | null;
  shipped_by_name: string | null;
  items: BillItemDetail[];
  status_logs: StatusLogRow[];
  audit_logs: AuditLogRow[];
}

export interface BillSummary extends BillRow {
  branch_name: string;
  item_count: number;
  billed_by_name: string | null;
}

export interface NotificationView {
  id: string;
  type: string;
  title: string;
  body: string | null;
  bill_id: string | null;
  branch_id: number | null;
  created_at: string;
  is_read: boolean;
}

export interface UploadTarget {
  path: string;
  token: string;
}
