import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { fromDbError, handle } from '@/lib/stock-request/errors';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';

export const dynamic = 'force-dynamic';

const MAX_NAMES = 12;

// ชื่อพนักงานที่เคยลงรายการ/ยืนยันรับในสาขานี้ (ล่าสุดก่อน) — ให้ทุกเครื่องของสาขากดเลือกชื่อได้โดยไม่ต้องพิมพ์ใหม่
export const GET = handle(async (request: NextRequest) => {
  const branch = await requireBranchContext(request);
  const db = getServiceClient();
  const [items, bills] = await Promise.all([
    db.from('bill_items').select('reported_by_name, created_at').eq('branch_id', branch.id).eq('source', 'branch').order('created_at', { ascending: false }).limit(300),
    db.from('bills').select('received_by_name, received_at').eq('branch_id', branch.id).not('received_by_name', 'is', null).order('received_at', { ascending: false }).limit(50),
  ]);
  if (items.error) throw fromDbError(items.error);
  if (bills.error) throw fromDbError(bills.error);

  const entries = [
    ...(items.data ?? []).map((row: { reported_by_name: string; created_at: string }) => ({ name: row.reported_by_name, at: row.created_at })),
    ...(bills.data ?? []).map((row: { received_by_name: string; received_at: string }) => ({ name: row.received_by_name, at: row.received_at })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const names: string[] = [];
  for (const { name } of entries) {
    const trimmed = name?.trim();
    if (trimmed && !names.includes(trimmed)) names.push(trimmed);
    if (names.length >= MAX_NAMES) break;
  }
  return NextResponse.json({ names });
});
