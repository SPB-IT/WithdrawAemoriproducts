import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { listHqNotifications } from '@/lib/stock-request/queries';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  const admin = await requireAdmin();
  return NextResponse.json({ notifications: await listHqNotifications(admin.id) });
});
