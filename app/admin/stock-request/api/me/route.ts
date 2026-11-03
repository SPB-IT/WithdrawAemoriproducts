import { NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => NextResponse.json({ admin: await requireAdmin() }));
