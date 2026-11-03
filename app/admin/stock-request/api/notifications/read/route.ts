import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { markHqNotificationsRead } from '@/lib/stock-request/queries';
import { isUuid, readJson } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

export const POST = handle(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const body = await readJson(request);
  const ids = body.ids === 'all' ? 'all' : Array.isArray(body.ids) ? body.ids.filter(isUuid).slice(0, 100) : [];
  await markHqNotificationsRead(admin.id, ids);
  return NextResponse.json({ ok: true });
});
