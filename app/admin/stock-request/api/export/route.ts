import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { parseBillFilters } from '@/lib/stock-request/filters';
import { getBranches, loadBillDetails } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillRow } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

const EXPORT_LIMIT = 300;

// ข้อมูลสำหรับส่งออก Excel (รายการสินค้า / ประวัติบิล / รายงานแก้ไข / รายงานสินค้าทดแทน) ตามตัวกรองเดียวกับหน้ารวมบิล
export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const filters = parseBillFilters(request.nextUrl.searchParams);
  const branches = await getBranches();

  let branchIds: number[] | null = filters.branchId ? [filters.branchId] : null;
  if (filters.query) {
    const matched = branches.filter((branch) => branch.name.toLowerCase().includes(filters.query)).map((branch) => branch.id);
    branchIds = branchIds ? branchIds.filter((id) => matched.includes(id)) : matched;
  }
  if (branchIds && branchIds.length === 0) return NextResponse.json({ bills: [], truncated: false });

  let query = getServiceClient()
    .from('bills')
    .select('*')
    .order('created_at', { ascending: false })
    .order('bill_no', { ascending: false })
    .limit(EXPORT_LIMIT + 1);
  if (filters.statuses.length) query = query.in('status', filters.statuses);
  if (branchIds) query = query.in('branch_id', branchIds);
  if (filters.from) query = query.gte('created_at', filters.from);
  if (filters.to) query = query.lte('created_at', filters.to);

  const { data, error } = await query;
  if (error) throw fromDbError(error);
  const rows = (data ?? []) as BillRow[];
  const limited = rows.slice(0, EXPORT_LIMIT);
  const bills = [];
  for (let index = 0; index < limited.length; index += 60) {
    bills.push(...(await loadBillDetails(limited.slice(index, index + 60), { audit: 'all', photos: false })));
  }
  return NextResponse.json({ bills, truncated: rows.length > EXPORT_LIMIT });
});
