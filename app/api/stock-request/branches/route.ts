import { NextResponse } from 'next/server';
import { handle } from '@/lib/stock-request/errors';
import { getBranches } from '@/lib/stock-request/queries';

export const dynamic = 'force-dynamic';

export const GET = handle(async () => {
  return NextResponse.json({ branches: await getBranches() });
});
