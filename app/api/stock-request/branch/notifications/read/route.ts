import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { markBranchNotificationsRead } from '@/lib/stock-request/queries';
import { isUuid, readJson } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const body = await readJson(request);
  const ids = body.ids === 'all' ? 'all' : Array.isArray(body.ids) ? body.ids.filter(isUuid).slice(0, 100) : [];
  await markBranchNotificationsRead(branch.id, ids);
  return NextResponse.json({ ok: true });
});
