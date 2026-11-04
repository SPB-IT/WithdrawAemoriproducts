import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { getBranchNameMap } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { AuditLogRow } from '@/lib/stock-request/types';
import { bangkokDayBoundary, parseBranchId } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

function snapshotLabel(data: Record<string, unknown> | null) {
  const name = typeof data?.product_name === 'string' ? data.product_name : null;
  if (!name) return null;
  return typeof data?.product_code === 'string' ? `${name} (${data.product_code})` : name;
}

const PAGE_SIZE = 50;
type Row = AuditLogRow & { bills: { bill_no: string; branch_id: number } | null };

// รายงานการแก้ไขทั้งหมด (audit log) พร้อมเลขบิล สาขา และชื่อสินค้า
export const GET = handle(async (request: NextRequest) => {
  await requireAdmin();
  const params = request.nextUrl.searchParams;
  const page = Math.max(1, Number(params.get('page')) || 1);
  const branchId = parseBranchId(params.get('branch'));
  const from = bangkokDayBoundary(params.get('from'), false);
  const to = bangkokDayBoundary(params.get('to'), true);
  const db = getServiceClient();

  let query = db
    .from('audit_logs')
    .select(branchId ? '*, bills!inner(bill_no, branch_id)' : '*, bills(bill_no, branch_id)', { count: 'exact' })
    .order('created_at', { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (branchId) query = query.eq('bills.branch_id', branchId);
  if (params.get('afterBilling') === '1') query = query.eq('after_billing', true);
  if (from) query = query.gte('created_at', from);
  if (to) query = query.lte('created_at', to);

  const { data, error, count } = await query;
  if (error) throw fromDbError(error);
  const rows = (data ?? []) as unknown as Row[];

  const itemIds = [...new Set(rows.map((row) => row.bill_item_id).filter((id): id is string => Boolean(id)))];
  const itemNames = new Map<string, string>();
  if (itemIds.length) {
    const { data: items, error: itemError } = await db.from('bill_items').select('id, product_name, product_code').in('id', itemIds);
    if (itemError) throw fromDbError(itemError);
    (items ?? []).forEach((item: { id: string; product_name: string; product_code: string }) => itemNames.set(item.id, `${item.product_name} (${item.product_code})`));
  }
  const branchNames = await getBranchNameMap();

  const logs = rows.map(({ bills, ...log }) => ({
    ...log,
    bill_no: bills?.bill_no ?? '-',
    branch_name: bills ? branchNames.get(bills.branch_id) ?? `สาขา ${bills.branch_id}` : '-',
    // รายการที่ถูกลบไปแล้ว (เช่น สาขาลบเอง) ใช้ชื่อจากข้อมูลก่อน/หลังใน log แทน
    item_label: log.bill_item_id ? itemNames.get(log.bill_item_id) ?? snapshotLabel(log.before_data ?? log.after_data) : null,
  }));
  return NextResponse.json({ logs, total: count ?? logs.length, page, pageSize: PAGE_SIZE });
});
