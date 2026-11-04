import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { loadBillDetails } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillRow } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

// บิลที่ตัดแล้วรอแพ็คของ (สถานะ billed) พร้อมความคืบหน้าการเช็คของ — เก่าก่อน (ทำตามลำดับ)
export const GET = handle(async () => {
  await requireAdmin();
  const { data, error } = await getServiceClient()
    .from('bills')
    .select('*')
    .eq('status', 'billed')
    .order('billed_at', { ascending: true })
    .limit(100);
  if (error) throw fromDbError(error);
  const bills = await loadBillDetails((data ?? []) as BillRow[], { photos: false, includeRemoved: false });
  return NextResponse.json({
    bills: bills.map((bill) => ({
      id: bill.id,
      bill_no: bill.bill_no,
      branch_name: bill.branch_name,
      billed_at: bill.billed_at,
      total: bill.items.length,
      picked: bill.items.filter((item) => item.picked_at).length,
      version: bill.version,
      checkers: [...new Set(bill.items.map((item) => item.picked_by).filter((name): name is string => !!name))],
    })),
  });
});
