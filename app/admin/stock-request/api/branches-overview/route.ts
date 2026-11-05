import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getBranchNameMap, getBranchOrder, getBranches, loadBillDetails, loadBranchHistory } from '@/lib/stock-request/queries';
import type { BillRow } from '@/lib/stock-request/types';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { parseBranchId } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// หน้า "รายสาขา" (หลังบ้าน)
// - ไม่ส่ง ?branch: บิลที่มีปัญหาค้างทุกสาขา + สรุปรายสาขา (บิลล่าสุด / ปัญหาค้าง)
// - ส่ง ?branch=ID: ประวัติของสาขานั้น (3 บิลล่าสุด + บิลที่ปัญหายังไม่ปิด) แบบละเอียด
// - ส่ง ?done=1: บิลที่จบแล้ว (ได้รับสินค้าแล้ว ไม่มีปัญหาค้าง) ทุกสาขา จัดกลุ่มตามสาขา สาขาละไม่เกิน 3 บิล
export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const branchParam = request.nextUrl.searchParams.get('branch');
  const branches = await getBranches();

  if (request.nextUrl.searchParams.get('done') === '1') {
    const { data, error } = await getServiceClient()
      .from('bills')
      .select('*')
      .eq('status', 'received')
      .or('issue_status.is.null,issue_status.neq.open')
      .order('received_at', { ascending: false })
      .limit(1500);
    if (error) throw fromDbError(error);
    const perBranch = new Map<number, BillRow[]>();
    for (const bill of (data ?? []) as BillRow[]) {
      const list = perBranch.get(bill.branch_id) ?? [];
      if (list.length < 3) perBranch.set(bill.branch_id, [...list, bill]);
    }
    const details = await loadBillDetails([...perBranch.values()].flat(), { photos: false, includeRemoved: false });
    const [names, order] = await Promise.all([getBranchNameMap(), getBranchOrder()]);
    const active = new Set(branches.map((branch) => branch.id));
    const groups = [...perBranch.keys()]
      .map((branchId) => ({
        branch_id: branchId,
        branch_name: names.get(branchId) ?? `สาขา ${branchId}`,
        archived: !active.has(branchId),
        bills: details.filter((bill) => bill.branch_id === branchId),
      }))
      .sort((a, b) => (order.get(a.branch_id) ?? 0) - (order.get(b.branch_id) ?? 0)); // ลำดับเดียวกับระบบเบิกสินค้า
    return NextResponse.json({ groups });
  }

  if (branchParam) {
    const branchId = parseBranchId(branchParam);
    const branch = branches.find((item) => item.id === branchId);
    if (!branch) throw new ApiError(404, 'SR_BRANCH_NOT_FOUND', 'ไม่พบสาขานี้');
    return NextResponse.json({ branch, bills: await loadBranchHistory(branch.id, 'all') });
  }

  const { data, error } = await getServiceClient()
    .from('bills')
    .select('id, bill_no, branch_id, status, created_at, billed_at, received_at, issue_status, issue_summary, issue_opened_at, responsible_name')
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .limit(2000);
  if (error) throw fromDbError(error);
  type Row = { id: string; bill_no: string; branch_id: number; status: string; created_at: string; received_at: string | null; issue_status: string | null; issue_summary: string | null; issue_opened_at: string | null; responsible_name: string | null };
  const rows = (data ?? []) as Row[];
  const names = new Map(branches.map((branch) => [branch.id, branch.name]));

  const issues = rows
    .filter((row) => row.issue_status === 'open')
    .sort((a, b) => (a.issue_opened_at ?? '').localeCompare(b.issue_opened_at ?? ''))
    .map((row) => ({ ...row, branch_name: names.get(row.branch_id) ?? `สาขา ${row.branch_id}` }));

  const summary = branches.map((branch) => {
    const own = rows.filter((row) => row.branch_id === branch.id);
    return {
      id: branch.id,
      name: branch.name,
      bill_count: Math.min(own.length, 3),
      latest: own[0] ? { bill_no: own[0].bill_no, status: own[0].status, created_at: own[0].created_at } : null,
      open_issues: own.filter((row) => row.issue_status === 'open').length,
    };
  });

  return NextResponse.json({ issues, branches: summary });
});
