import 'server-only';
import { SR_BUCKET, SR_HISTORY_LIMIT } from './constants';
import { ApiError, fromDbError } from './errors';
import { getServiceClient } from './supabase-admin';
import type {
  AuditLogRow,
  Branch,
  BillDetail,
  BillItemDetail,
  BillItemRow,
  BillRow,
  NotificationRow,
  NotificationView,
  StatusLogRow,
  SubstitutionDetail,
  SubstitutionRow,
  UploadTarget,
} from './types';

const PHOTO_URL_TTL_SECONDS = 60 * 60;

// ---------------------------------------------------------------------------
// RPC
// ---------------------------------------------------------------------------
export async function rpc<T>(fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await getServiceClient().rpc(fn, args);
  if (error) throw fromDbError(error);
  return data as T;
}

// ---------------------------------------------------------------------------
// Branches (public.branches — read only, shared with the legacy system)
// ---------------------------------------------------------------------------
// สาขาที่ "เก็บถาวร" (archived_at) ถูกซ่อนจากรายการเลือก แต่ยังใช้แสดงชื่อในประวัติบิลได้
// เรียงตามชื่อจากฐานข้อมูล (order by name) — ลำดับเดียวกับระบบเบิกสินค้า
let branchCache: { at: number; data: (Branch & { archived: boolean })[] } | null = null;

async function loadAllBranches() {
  if (branchCache && Date.now() - branchCache.at < 60_000) return branchCache.data;
  const { data, error } = await getServiceClient().schema('public').from('branches').select('id, name, archived_at').order('name');
  if (error) throw fromDbError(error);
  const branches = (data ?? []).map((row: { id: number | string; name: string; archived_at: string | null }) => ({ id: Number(row.id), name: row.name, archived: !!row.archived_at }));
  branchCache = { at: Date.now(), data: branches };
  return branches;
}

export function clearBranchCache() {
  branchCache = null;
}

/** สาขาที่ใช้งานอยู่ (ไม่รวมที่เก็บถาวร) */
export async function getBranches(): Promise<Branch[]> {
  return (await loadAllBranches()).filter((branch) => !branch.archived).map(({ id, name }) => ({ id, name }));
}

export async function getBranch(branchId: number): Promise<Branch | null> {
  const branches = await getBranches();
  return branches.find((branch) => branch.id === branchId) ?? null;
}

/** ลำดับสาขา (เหมือนระบบเบิกสินค้า) — ใช้เรียงกลุ่มตามสาขา */
export async function getBranchOrder(): Promise<Map<number, number>> {
  return new Map((await loadAllBranches()).map((branch, index) => [branch.id, index]));
}

/** ชื่อสาขาทั้งหมด รวมที่เก็บถาวร — ใช้แสดงในประวัติบิล */
export async function getBranchNameMap(): Promise<Map<number, string>> {
  return new Map((await loadAllBranches()).map((branch) => [branch.id, branch.name]));
}

// ---------------------------------------------------------------------------
// Admin names
// ---------------------------------------------------------------------------
export async function getAdminNameMap(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((id): id is string => Boolean(id)))];
  if (unique.length === 0) return new Map();
  const { data, error } = await getServiceClient().from('admin_profiles').select('id, display_name').in('id', unique);
  if (error) throw fromDbError(error);
  return new Map((data ?? []).map((row: { id: string; display_name: string }) => [row.id, row.display_name]));
}

// ---------------------------------------------------------------------------
// Storage
// ---------------------------------------------------------------------------
function bangkokYearMonth() {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok', year: 'numeric', month: '2-digit' }).formatToParts(new Date());
  const year = parts.find((part) => part.type === 'year')?.value;
  const month = parts.find((part) => part.type === 'month')?.value;
  return `${year}${month}`;
}

export async function createUploadTarget(branchId: number): Promise<UploadTarget> {
  const path = `${branchId}/${bangkokYearMonth()}/${crypto.randomUUID()}.jpg`;
  const { data, error } = await getServiceClient().storage.from(SR_BUCKET).createSignedUploadUrl(path);
  if (error || !data) {
    console.error('[stock-request] createSignedUploadUrl failed', error);
    throw new ApiError(500, 'SR_STORAGE_ERROR', 'ไม่สามารถเตรียมอัปโหลดรูปได้ กรุณาลองใหม่');
  }
  return { path: data.path, token: data.token };
}

/** Make sure an uploaded photo really exists before a row references it. */
export async function assertPhotoUploaded(path: string) {
  const slash = path.lastIndexOf('/');
  const folder = path.slice(0, slash);
  const file = path.slice(slash + 1);
  const { data, error } = await getServiceClient().storage.from(SR_BUCKET).list(folder, { search: file, limit: 1 });
  if (error || !data?.some((entry) => entry.name === file)) {
    throw new ApiError(400, 'SR_INVALID_PHOTO', 'ไม่พบรูปที่อัปโหลด กรุณาถ่ายหรือเลือกรูปใหม่');
  }
}

export async function signPhotoUrls(paths: (string | null | undefined)[]): Promise<Map<string, string>> {
  const unique = [...new Set(paths.filter((path): path is string => Boolean(path)))];
  const result = new Map<string, string>();
  for (let index = 0; index < unique.length; index += 100) {
    const chunk = unique.slice(index, index + 100);
    const { data, error } = await getServiceClient().storage.from(SR_BUCKET).createSignedUrls(chunk, PHOTO_URL_TTL_SECONDS);
    if (error) {
      console.error('[stock-request] createSignedUrls failed', error);
      continue;
    }
    for (const entry of data ?? []) {
      if (entry.path && entry.signedUrl) result.set(entry.path, entry.signedUrl);
    }
  }
  return result;
}

/** Delete photos of bills purged by the 3-bill history rule. Safe to call often; failures are retried later. */
export async function processStorageCleanup(limit = 100) {
  const db = getServiceClient();
  const { data, error } = await db
    .from('storage_cleanup_queue')
    .select('id, bucket, path, attempts')
    .is('processed_at', null)
    .lt('attempts', 5)
    .order('created_at')
    .limit(limit);
  if (error || !data?.length) return 0;

  const rows = data as { id: string; bucket: string; path: string; attempts: number }[];
  const byBucket = new Map<string, typeof rows>();
  rows.forEach((row) => byBucket.set(row.bucket, [...(byBucket.get(row.bucket) ?? []), row]));

  let processed = 0;
  for (const [bucket, bucketRows] of byBucket) {
    const { error: removeError } = await db.storage.from(bucket).remove(bucketRows.map((row) => row.path));
    if (removeError) {
      for (const row of bucketRows) {
        await db
          .from('storage_cleanup_queue')
          .update({ attempts: row.attempts + 1, last_error: removeError.message })
          .eq('id', row.id);
      }
      continue;
    }
    await db
      .from('storage_cleanup_queue')
      .update({ processed_at: new Date().toISOString() })
      .in('id', bucketRows.map((row) => row.id));
    processed += bucketRows.length;
  }
  return processed;
}

// ---------------------------------------------------------------------------
// Bills
// ---------------------------------------------------------------------------
type ItemWithSubs = BillItemRow & { item_substitutions: SubstitutionRow[] | null };

export interface BillDetailOptions {
  audit?: 'all' | 'after_billing' | 'none';
  photos?: boolean;
  includeRemoved?: boolean;
}

export async function loadBillDetails(bills: BillRow[], options: BillDetailOptions = {}): Promise<BillDetail[]> {
  const { audit = 'none', photos = true, includeRemoved = true } = options;
  if (bills.length === 0) return [];
  const db = getServiceClient();
  const billIds = bills.map((bill) => bill.id);

  let itemQuery = db
    .from('bill_items')
    .select('*, item_substitutions(*)')
    .in('bill_id', billIds)
    .order('created_at', { ascending: true });
  if (!includeRemoved) itemQuery = itemQuery.eq('is_removed', false);

  const statusQuery = db.from('status_logs').select('*').in('bill_id', billIds).order('changed_at', { ascending: true });

  let auditQuery = db.from('audit_logs').select('*').in('bill_id', billIds).order('created_at', { ascending: false });
  if (audit === 'after_billing') auditQuery = auditQuery.eq('after_billing', true);

  const [itemsResult, statusResult, auditResult, branchNames] = await Promise.all([
    itemQuery,
    statusQuery,
    audit === 'none' ? Promise.resolve({ data: [], error: null }) : auditQuery,
    getBranchNameMap(),
  ]);
  if (itemsResult.error) throw fromDbError(itemsResult.error);
  if (statusResult.error) throw fromDbError(statusResult.error);
  if (auditResult.error) throw fromDbError(auditResult.error);

  const items = (itemsResult.data ?? []) as ItemWithSubs[];
  const statusLogs = (statusResult.data ?? []) as StatusLogRow[];
  const auditLogs = (auditResult.data ?? []) as AuditLogRow[];

  const allSubs = items.flatMap((item) => item.item_substitutions ?? []);
  const [photoUrls, adminNames] = await Promise.all([
    photos ? signPhotoUrls([...items.map((item) => item.photo_path), ...allSubs.map((sub) => sub.photo_path)]) : Promise.resolve(new Map<string, string>()),
    getAdminNameMap([...bills.flatMap((bill) => [bill.billed_by, bill.shipped_by]), ...allSubs.map((sub) => sub.created_by)]),
  ]);

  const toSubDetail = (sub: SubstitutionRow): SubstitutionDetail => ({
    ...sub,
    photo_url: sub.photo_path ? photoUrls.get(sub.photo_path) ?? null : null,
    created_by_name: adminNames.get(sub.created_by) ?? null,
  });

  const itemsByBill = new Map<string, BillItemDetail[]>();
  for (const { item_substitutions: subs, ...item } of items) {
    const history = (subs ?? []).slice().sort((a, b) => a.created_at.localeCompare(b.created_at)).map(toSubDetail);
    const detail: BillItemDetail = {
      ...item,
      photo_url: item.photo_path ? photoUrls.get(item.photo_path) ?? null : null,
      substitution: history.find((sub) => sub.is_active) ?? null,
      substitution_history: history,
    };
    itemsByBill.set(item.bill_id, [...(itemsByBill.get(item.bill_id) ?? []), detail]);
  }

  return bills.map((bill) => ({
    ...bill,
    branch_name: branchNames.get(bill.branch_id) ?? `สาขา ${bill.branch_id}`,
    // ผู้รับผิดชอบที่กรอกตอนตัดบิลมาก่อน (บิลเก่าใช้ชื่อโปรไฟล์ผู้ดูแล)
    billed_by_name: bill.responsible_name ?? (bill.billed_by ? adminNames.get(bill.billed_by) ?? null : null),
    shipped_by_name: bill.shipped_by ? adminNames.get(bill.shipped_by) ?? null : null,
    items: itemsByBill.get(bill.id) ?? [],
    status_logs: statusLogs.filter((log) => log.bill_id === bill.id),
    audit_logs: auditLogs.filter((log) => log.bill_id === bill.id),
  }));
}

export async function getBillRow(billId: string): Promise<BillRow> {
  const { data, error } = await getServiceClient().from('bills').select('*').eq('id', billId).maybeSingle();
  if (error) throw fromDbError(error);
  if (!data) throw new ApiError(404, 'SR_BILL_NOT_FOUND', 'ไม่พบบิล');
  return data as BillRow;
}

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------
const NOTIFICATION_LIMIT = 30;

export async function listBranchNotifications(branchId: number): Promise<NotificationView[]> {
  const { data, error } = await getServiceClient()
    .from('notifications')
    .select('*')
    .eq('audience', 'branch')
    .eq('branch_id', branchId)
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_LIMIT);
  if (error) throw fromDbError(error);
  return ((data ?? []) as NotificationRow[]).map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    bill_id: row.bill_id,
    branch_id: row.branch_id,
    created_at: row.created_at,
    is_read: Boolean(row.branch_read_at),
  }));
}

export async function markBranchNotificationsRead(branchId: number, ids: string[] | 'all') {
  if (ids !== 'all' && ids.length === 0) return;
  let query = getServiceClient()
    .from('notifications')
    .update({ branch_read_at: new Date().toISOString() })
    .eq('audience', 'branch')
    .eq('branch_id', branchId)
    .is('branch_read_at', null);
  if (ids !== 'all') query = query.in('id', ids);
  const { error } = await query;
  if (error) throw fromDbError(error);
}

export async function listHqNotifications(adminId: string): Promise<NotificationView[]> {
  const db = getServiceClient();
  const { data, error } = await db
    .from('notifications')
    .select('*')
    .eq('audience', 'hq')
    .order('created_at', { ascending: false })
    .limit(NOTIFICATION_LIMIT);
  if (error) throw fromDbError(error);
  const rows = (data ?? []) as NotificationRow[];
  if (rows.length === 0) return [];
  const { data: reads, error: readError } = await db
    .from('notification_reads')
    .select('notification_id')
    .eq('admin_id', adminId)
    .in('notification_id', rows.map((row) => row.id));
  if (readError) throw fromDbError(readError);
  const readIds = new Set((reads ?? []).map((row: { notification_id: string }) => row.notification_id));
  return rows.map((row) => ({
    id: row.id,
    type: row.type,
    title: row.title,
    body: row.body,
    bill_id: row.bill_id,
    branch_id: row.branch_id,
    created_at: row.created_at,
    is_read: readIds.has(row.id),
  }));
}

export async function markHqNotificationsRead(adminId: string, ids: string[] | 'all') {
  const db = getServiceClient();
  let targetIds = ids;
  if (ids === 'all') {
    targetIds = (await listHqNotifications(adminId)).filter((item) => !item.is_read).map((item) => item.id);
  }
  const list = targetIds as string[];
  if (list.length === 0) return;
  const { error } = await db
    .from('notification_reads')
    .upsert(list.map((id) => ({ notification_id: id, admin_id: adminId })), { onConflict: 'notification_id,admin_id', ignoreDuplicates: true });
  if (error) throw fromDbError(error);
}

// ---------------------------------------------------------------------------
// Branch activity log — ให้ผู้ดูแลเห็นว่าพนักงานสาขาคนไหนทำอะไร (audit_logs, admin_id = null)
// ---------------------------------------------------------------------------
const ITEM_LOG_KEYS = ['product_name', 'product_code', 'stock_on_hand', 'staff_note', 'photo_path'] as const;

export function pickItemFields(item: Partial<BillItemRow> | null | undefined) {
  if (!item) return null;
  return Object.fromEntries(ITEM_LOG_KEYS.filter((key) => key in item).map((key) => [key, item[key] ?? null]));
}

export async function logBranchAction(entry: {
  billId: string;
  itemId?: string | null;
  staffName: string;
  action: 'item_add' | 'item_update' | 'item_remove' | 'status_change';
  before?: Record<string, unknown> | null;
  after?: Record<string, unknown> | null;
}) {
  // บันทึกไม่สำเร็จไม่ควรทำให้งานหลักล้ม — แค่ log ไว้ฝั่ง server
  const { error } = await getServiceClient().from('audit_logs').insert({
    bill_id: entry.billId,
    bill_item_id: entry.itemId ?? null,
    admin_id: null,
    admin_name: `สาขา · ${entry.staffName}`,
    action: entry.action,
    before_data: entry.before ?? null,
    after_data: entry.after ?? null,
    after_billing: false,
  });
  if (error) console.error('[stock-request] branch audit log failed', { code: error.code, message: error.message });
}

// ---------------------------------------------------------------------------
// ประวัติของสาขา: 3 บิลล่าสุดที่ตัดแล้ว + บิลที่ปัญหายังไม่ปิด (ไม่ถูกลบจนกว่าจะปิดเรื่อง)
// ---------------------------------------------------------------------------
export async function loadBranchHistory(branchId: number, audit: BillDetailOptions['audit'] = 'after_billing') {
  const db = getServiceClient();
  const [recent, openIssues] = await Promise.all([
    db
      .from('bills')
      .select('*')
      .eq('branch_id', branchId)
      .neq('status', 'pending')
      .order('created_at', { ascending: false })
      .order('bill_no', { ascending: false })
      .limit(SR_HISTORY_LIMIT),
    db.from('bills').select('*').eq('branch_id', branchId).eq('issue_status', 'open').order('created_at', { ascending: false }),
  ]);
  if (recent.error) throw fromDbError(recent.error);
  if (openIssues.error) throw fromDbError(openIssues.error);
  const recentRows = (recent.data ?? []) as BillRow[];
  const seen = new Set(recentRows.map((bill) => bill.id));
  const extra = ((openIssues.data ?? []) as BillRow[]).filter((bill) => !seen.has(bill.id));
  return loadBillDetails([...recentRows, ...extra], { audit });
}

/** คัดลอกรูปไปไฟล์ใหม่ของสาขา (ใช้ตอนยกยอดรายการ — บิลเก่าอาจถูกลบพร้อมรูปตามกฎ 3 บิล) · คัดลอกไม่ได้คืน null */
export async function copyItemPhoto(sourcePath: string | null, branchId: number): Promise<string | null> {
  if (!sourcePath) return null;
  const ext = sourcePath.split('.').pop()?.toLowerCase();
  const target = `${branchId}/${bangkokYearMonth()}/${crypto.randomUUID()}.${ext === 'png' || ext === 'webp' ? ext : 'jpg'}`;
  const { error } = await getServiceClient().storage.from(SR_BUCKET).copy(sourcePath, target);
  if (error) {
    console.error('[stock-request] copy photo failed', error.message);
    return null;
  }
  return target;
}
