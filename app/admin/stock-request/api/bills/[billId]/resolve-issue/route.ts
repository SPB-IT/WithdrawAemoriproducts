import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getBillRow } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ปิดเรื่องบิลที่มีปัญหา (สาขาแจ้งของไม่ครบ) — ต้องระบุวิธีแก้/หมายเหตุ และชื่อผู้ปิดเรื่อง · แจ้งสาขา · บันทึก Audit Log
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  const body = await readJson(request);
  const note = requireText(body.note, 1000, 'หมายเหตุการแก้ไขปัญหา');
  const resolver = requireText(body.resolverName, 100, 'ชื่อผู้ปิดเรื่อง');
  if (bill.issue_status !== 'open') throw new ApiError(409, 'SR_NO_OPEN_ISSUE', 'บิลนี้ไม่มีปัญหาที่รอแก้ไข');

  const db = getServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await db
    .from('bills')
    .update({ issue_status: 'resolved', issue_resolved_note: note, issue_resolved_by: resolver, issue_resolved_at: now })
    .eq('id', bill.id)
    .eq('issue_status', 'open') // กันปิดซ้ำพร้อมกัน
    .select('id');
  if (error) throw fromDbError(error);
  if (!data?.length) throw new ApiError(409, 'SR_NO_OPEN_ISSUE', 'บิลนี้ถูกปิดเรื่องไปแล้ว');

  const [audit, notify] = await Promise.all([
    db.from('audit_logs').insert({
      bill_id: bill.id,
      admin_id: admin.id,
      admin_name: `${admin.display_name} · ${resolver}`,
      action: 'status_change',
      before_data: { issue: 'เปิดเรื่อง (ของไม่ครบ)' },
      after_data: { issue: 'ปิดเรื่องแล้ว' },
      reason: note,
      after_billing: true,
    }),
    db.from('notifications').insert({
      audience: 'branch',
      branch_id: bill.branch_id,
      bill_id: bill.id,
      type: 'issue_resolved',
      title: 'สำนักงานใหญ่แก้ไขปัญหาบิลแล้ว',
      body: `บิล ${bill.bill_no}: ${note} (โดย ${resolver})`.slice(0, 1000),
    }),
  ]);
  if (audit.error) console.error('[stock-request] resolve audit failed', audit.error.message);
  if (notify.error) console.error('[stock-request] resolve notify failed', notify.error.message);
  return NextResponse.json({ ok: true });
});
