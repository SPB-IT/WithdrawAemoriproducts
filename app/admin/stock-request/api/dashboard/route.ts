import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { STATUS_ORDER } from '@/lib/stock-request/constants';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { getBranchNameMap, getBranches, processStorageCleanup, signPhotoUrls } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillItemRow, BillStatus } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

type PendingBill = { id: string; bill_no: string; branch_id: number; created_at: string; updated_at: string; bill_items: { count: number }[] };
type LatestItem = BillItemRow & { bills: { bill_no: string; status: BillStatus } | null };

export const GET = handle(async () => {
  await requireAdmin();
  const db = getServiceClient();

  const countFor = (status: BillStatus) => db.from('bills').select('id', { count: 'exact', head: true }).eq('status', status);
  const [counts, pendingResult, latestResult, branches, branchNames] = await Promise.all([
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
  ]);

  for (const result of counts) if (result.error) throw fromDbError(result.error);
  if (pendingResult.error) throw fromDbError(pendingResult.error);
  if (latestResult.error) throw fromDbError(latestResult.error);

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

  const { count: openIssues } = await db.from('bills').select('id', { count: 'exact', head: true }).eq('issue_status', 'open');

  return NextResponse.json({
    branchCount: branches.length,
    openIssues: openIssues ?? 0,
    statusCounts,
    pendingWithItems: pending,
    latest,
  });
});
