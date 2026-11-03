import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { SR_HISTORY_LIMIT } from '@/lib/stock-request/constants';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { loadBillDetails } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillRow } from '@/lib/stock-request/types';

export const dynamic = 'force-dynamic';

// ประวัติ 3 บิลล่าสุดของสาขา (ไม่รวมบิลที่ยังเปิดอยู่)
export const GET = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const { data, error } = await getServiceClient()
    .from('bills')
    .select('*')
    .eq('branch_id', branch.id)
    .neq('status', 'pending')
    .order('created_at', { ascending: false })
    .order('bill_no', { ascending: false })
    .limit(SR_HISTORY_LIMIT);
  if (error) throw fromDbError(error);
  const bills = await loadBillDetails((data ?? []) as BillRow[], { audit: 'after_billing' });
  return NextResponse.json({ bills });
});
