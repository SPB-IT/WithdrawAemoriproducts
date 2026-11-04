import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { getAdminNameMap, getBranchNameMap } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { parseBillFilters } from '@/lib/stock-request/filters';
import type { BillRow, BillSummary } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 30;

export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const filters = parseBillFilters(params);
  const page = Math.max(1, Number(params.get('page')) || 1);
  const branchNames = await getBranchNameMap(); // รวมสาขาที่เก็บถาวร เพื่อแสดงชื่อในประวัติ
  const branches = [...branchNames].map(([id, name]) => ({ id, name }));

  let branchIds: number[] | null = filters.branchId ? [filters.branchId] : null;
  if (filters.query) {
    const matched = branches.filter((branch) => branch.name.toLowerCase().includes(filters.query)).map((branch) => branch.id);
    branchIds = branchIds ? branchIds.filter((id) => matched.includes(id)) : matched;
  }
  if (branchIds && branchIds.length === 0) return NextResponse.json({ bills: [], total: 0, page, pageSize: PAGE_SIZE });

  let query = getServiceClient()
    .from('bills')
    .select('*, bill_items(count)', { count: 'exact' })
    .eq('bill_items.is_removed', false)
    .order('created_at', { ascending: false })
    .order('bill_no', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (filters.statuses.length) query = query.in('status', filters.statuses);
  // hideDone: ซ่อนบิลที่จบแล้ว (ได้รับสินค้าแล้ว และไม่มีปัญหาค้าง) — ดูย้อนหลังได้ที่หน้ารายสาขา
  if (params.get('hideDone') === '1') query = query.or('status.neq.received,issue_status.eq.open');
  if (branchIds) query = query.in('branch_id', branchIds);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error, count } = await query;
  if (error) throw fromDbError(error);
  const rows = (data ?? []) as (BillRow & { bill_items: { count: number }[] })[];
  const adminNames = await getAdminNameMap(rows.map((row) => row.billed_by));

  const bills: BillSummary[] = rows.map(({ bill_items: itemCount, ...bill }) => ({
    ...bill,
    branch_name: branchNames.get(bill.branch_id) ?? `สาขา ${bill.branch_id}`,
    item_count: itemCount?.[0]?.count ?? 0,
    billed_by_name: bill.responsible_name ?? (bill.billed_by ? adminNames.get(bill.billed_by) ?? null : null),
  }));
  return NextResponse.json({ bills, total: count ?? bills.length, page, pageSize: PAGE_SIZE });
});
