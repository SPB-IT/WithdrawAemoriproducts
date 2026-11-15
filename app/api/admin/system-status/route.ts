import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requisition-server';
import { ApiError } from '@/lib/stock-request/errors';
import { getSystemStatuses, setSystemStatus, SYSTEM_KEYS, type SystemKey } from '@/lib/system-status';

function fail(e: unknown) {
  if (e instanceof ApiError) return NextResponse.json({ error: e.message }, { status: e.status });
  console.error('[system-status]', e);
  return NextResponse.json({ error: 'เกิดข้อผิดพลาด' }, { status: 500 });
}

export async function GET() {
  try {
    await requireAdminApi();
    return NextResponse.json(await getSystemStatuses());
  } catch (e) {
    return fail(e);
  }
}

export async function PUT(request: Request) {
  try {
    await requireAdminApi();
    const body = (await request.json().catch(() => null)) as { system?: string; closed?: unknown; message?: unknown } | null;
    const system = body?.system as SystemKey;
    if (!SYSTEM_KEYS.includes(system) || typeof body?.closed !== 'boolean') return NextResponse.json({ error: 'ข้อมูลไม่ถูกต้อง' }, { status: 400 });
    const message = typeof body.message === 'string' ? body.message.slice(0, 300) : null;
    const result = await setSystemStatus(system, body.closed, message);
    if (!result.ok) return NextResponse.json({ error: result.error }, { status: 500 });
    return NextResponse.json(await getSystemStatuses());
  } catch (e) {
    return fail(e);
  }
}
