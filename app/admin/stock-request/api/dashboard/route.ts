import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { STATUS_ORDER } from '@/lib/stock-request/constants';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { getBranchNameMap, getBranches, processStorageCleanup, signPhotoUrls } from '@/lib/stock-request/queries';
import { isPartial, sentQty, shortQty, shortfallHandled } from '@/lib/stock-request/qty';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillItemRow, BillStatus } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

type PendingBill = { id: string; bill_no: string; branch_id: number; created_at: string; updated_at: string; bill_items: { count: number }[] };
type LatestItem = BillItemRow & { bills: { bill_no: string; status: BillStatus } | null };
type StockRow = Pick<BillItemRow, 'id' | 'bill_id' | 'branch_id' | 'product_name' | 'product_code' | 'stock_on_hand' | 'hq_ship_qty' | 'hq_note' | 'picked_at' | 'received_note'> & {
  bills: { bill_no: string; status: BillStatus } | null;
};
const STOCK_COLUMNS = 'id, bill_id, branch_id, product_name, product_code, stock_on_hand, hq_ship_qty, hq_note, picked_at, received_note, bills!inner(bill_no, status)';

export const GET = handle(async () => {
  await requireAdmin();
  const db = getServiceClient();

  const countFor = (status: BillStatus) => db.from('bills').select('id', { count: 'exact', head: true }).eq('status', status);
  // ยิงทุก query พร้อมกัน (ฐานข้อมูลอยู่ไกล ลดจำนวนรอบการรอ)
  const [counts, pendingResult, latestResult, branches, branchNames, openIssuesResult, reportedResult, packingResult, missingResult, rejectedResult, partialResult] = await Promise.all([
    Promise.all(STATUS_ORDER.map((status) => countFor(status))),
    db
      .from('bills')
      .select('id, bill_no, branch_id, created_at, updated_at, bill_items(count)')
      .eq('status', 'pending')
      .eq('bill_items.is_removed', false),
    db
      .from('bill_items')
      .select('*, bills(bill_no, status)')
      .eq('is_removed', false)
      .order('created_at', { ascending: false })
      .limit(12),
    getBranches(),
    getBranchNameMap(),
    db.from('bills').select('id', { count: 'exact', head: true }).eq('issue_status', 'open'),
    // สรุปสินค้า: รายการที่สาขาแจ้งรอบนี้ / รายการในบิลที่ตัดแล้ว (รอแพ็ค) / ของที่สาขาแจ้งว่าขาด / ของที่ไม่มีส่ง
    db.from('bill_items').select(STOCK_COLUMNS).eq('is_removed', false).eq('bills.status', 'pending').limit(2000),
    db.from('bill_items').select(STOCK_COLUMNS).eq('is_removed', false).eq('bills.status', 'billed').limit(2000),
    db.from('bill_items').select(`${STOCK_COLUMNS.replace('bills!inner(bill_no, status)', 'bills!inner(bill_no, status, issue_status)')}`).eq('received_state', 'missing').eq('bills.issue_status', 'open').limit(200),
    db.from('bill_items').select(STOCK_COLUMNS).eq('is_removed', true).in('bills.status', ['billed', 'shipped']).limit(200),
    // ของไม่พอ ส่งได้ไม่ครบ (บิลที่ตัดแล้ว) — ค้างจนกว่าแอดมินจะจัดการส่วนที่ขาด
    db.from('bill_items').select(STOCK_COLUMNS).eq('is_removed', false).not('hq_ship_qty', 'is', null).in('bills.status', ['billed', 'shipped', 'received']).limit(300),
  ]);

  for (const result of counts) if (result.error) throw fromDbError(result.error);
  if (pendingResult.error) throw fromDbError(pendingResult.error);
  if (latestResult.error) throw fromDbError(latestResult.error);
  for (const result of [reportedResult, packingResult, missingResult, rejectedResult, partialResult]) if (result.error) throw fromDbError(result.error);

  const statusCounts = Object.fromEntries(STATUS_ORDER.map((status, index) => [status, counts[index].count ?? 0])) as Record<BillStatus, number>;
  const pending = ((pendingResult.data ?? []) as PendingBill[])
    .map((bill) => ({
      id: bill.id,
      bill_no: bill.bill_no,
      branch_id: bill.branch_id,
      branch_name: branchNames.get(bill.branch_id) ?? `สาขา ${bill.branch_id}`,
      created_at: bill.created_at,
      updated_at: bill.updated_at,
      item_count: bill.bill_items?.[0]?.count ?? 0,
    }))
    .filter((bill) => bill.item_count > 0)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));

  const latestRows = (latestResult.data ?? []) as LatestItem[];
  const photos = await signPhotoUrls(latestRows.map((row) => row.photo_path));
  const latest = latestRows.map((row) => ({
    id: row.id,
    bill_id: row.bill_id,
    bill_no: row.bills?.bill_no ?? '-',
    bill_status: row.bills?.status ?? 'pending',
    branch_name: branchNames.get(row.branch_id) ?? `สาขา ${row.branch_id}`,
    product_name: row.product_name,
    product_code: row.product_code,
    stock_on_hand: row.stock_on_hand,
    reported_by_name: row.reported_by_name,
    created_at: row.created_at,
    photo_url: row.photo_path ? photos.get(row.photo_path) ?? null : null,
  }));

  // ลบไฟล์รูปของบิลที่พ้นประวัติ 3 บิล (ถ้ามีค้างอยู่)
  processStorageCleanup(50).catch((error) => console.error('[stock-request] cleanup', error));

  const reported = (reportedResult.data ?? []) as unknown as StockRow[];
  const packingRows = (packingResult.data ?? []) as unknown as StockRow[];
  const missingRows = (missingResult.data ?? []) as unknown as StockRow[];
  const rejectedRows = (rejectedResult.data ?? []) as unknown as StockRow[];
  const partialRows = ((partialResult.data ?? []) as unknown as StockRow[]).filter((row) => isPartial(row) && !shortfallHandled(row)); // จัดการส่วนที่ขาดแล้ว ไม่ต้องค้าง
  const nameOf = (branchId: number) => branchNames.get(branchId) ?? `สาขา ${branchId}`;

  // สินค้าที่สาขาแจ้งรอบนี้ รวมตามรหัสสินค้า — หลายสาขาสั่ง/สั่งรวมมากขึ้นก่อน
  const byProduct = new Map<string, { product_code: string; product_name: string; branches: { name: string; stock: number | null }[] }>();
  for (const row of reported) {
    const key = row.product_code.trim().toUpperCase();
    const entry = byProduct.get(key) ?? { product_code: row.product_code, product_name: row.product_name, branches: [] };
    entry.branches.push({ name: nameOf(row.branch_id), stock: row.stock_on_hand });
    byProduct.set(key, entry);
  }
  const topProducts = [...byProduct.values()]
    .map((entry) => ({ ...entry, total_qty: entry.branches.reduce((sum, branch) => sum + (branch.stock ?? 0), 0) }))
    .sort((a, b) => b.branches.length - a.branches.length || b.total_qty - a.total_qty)
    .slice(0, 10)


  const unpicked = packingRows.filter((row) => !row.picked_at);
  // ของขาด = สาขาแจ้งว่าไม่ได้รับ (ปัญหายังไม่ปิด) + ของที่ผู้แพ็คของกดว่าไม่มีของส่ง (บิลรอบนี้)
  const removeReasons = new Map<string, string>();
  if (rejectedRows.length) {
    const { data: logs } = await db.from('audit_logs').select('bill_item_id, reason, created_at').eq('action', 'item_remove').in('bill_item_id', rejectedRows.map((row) => row.id)).order('created_at', { ascending: false });
    for (const log of (logs ?? []) as { bill_item_id: string; reason: string | null }[]) if (!removeReasons.has(log.bill_item_id) && log.reason) removeReasons.set(log.bill_item_id, log.reason);
  }
  const shortages = [
    ...missingRows.map((row) => ({ kind: 'missing' as const, id: row.id, bill_id: row.bill_id, bill_no: row.bills?.bill_no ?? '-', branch_name: nameOf(row.branch_id), product_name: row.product_name, product_code: row.product_code, note: row.received_note })),
    ...partialRows.map((row) => ({ kind: 'partial' as const, id: row.id, bill_id: row.bill_id, bill_no: row.bills?.bill_no ?? '-', branch_name: nameOf(row.branch_id), product_name: row.product_name, product_code: row.product_code, note: `ส่งได้ ${sentQty(row)}/${row.stock_on_hand} ชิ้น · ขาด ${shortQty(row)}` })),
    ...rejectedRows.map((row) => ({ kind: 'no_stock' as const, id: row.id, bill_id: row.bill_id, bill_no: row.bills?.bill_no ?? '-', branch_name: nameOf(row.branch_id), product_name: row.product_name, product_code: row.product_code, note: removeReasons.get(row.id) ?? null })),
  ];

  const stock = {
    reportedItems: reported.length,
    reportedBranches: new Set(reported.map((row) => row.branch_id)).size,
    orderedQty: reported.reduce((sum, row) => sum + (row.stock_on_hand ?? 0), 0),
    toPack: unpicked.length,
    toPackBills: new Set(unpicked.map((row) => row.bill_id)).size,
    packedBillsReady: [...new Set(packingRows.map((row) => row.bill_id))].filter((billId) => !unpicked.some((row) => row.bill_id === billId)).length,
    shortages: shortages.length,
    topProducts,
    shortageList: shortages.slice(0, 30),
  };

  return NextResponse.json({
    stock,
    branchCount: branches.length,
    openIssues: openIssuesResult.count ?? 0,
    statusCounts,
    pendingWithItems: pending,
    latest,
  });
});
