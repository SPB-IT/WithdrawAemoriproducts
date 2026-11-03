import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { listBranchNotifications } from '@/lib/stock-request/queries';

export const dynamic = 'force-dynamic';

export const GET = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  return NextResponse.json({ notifications: await listBranchNotifications(branch.id) });
});
