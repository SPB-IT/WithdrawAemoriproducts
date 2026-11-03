import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { getBillRow, loadBillDetails } from '@/lib/stock-request/queries';
import { requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

export const GET = handle(async (_request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const { billId } = await context.params;
  const bill = await getBillRow(requireUuid(billId, 'รหัสบิล'));
  const [detail] = await loadBillDetails([bill], { audit: 'all' });
  return NextResponse.json({ bill: detail, admin });
});
