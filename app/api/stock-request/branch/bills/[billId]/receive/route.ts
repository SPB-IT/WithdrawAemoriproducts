import { NextRequest, NextResponse } from 'next/server';
import { requireBranchContext } from '@/lib/stock-request/branch-context';
import { handle } from '@/lib/stock-request/errors';
import { logBranchAction, processStorageCleanup, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// พนักงานสาขายืนยันว่าได้รับสินค้าแล้ว (บันทึกชื่อ + เวลา) แล้วล้างประวัติที่เกิน 3 บิล
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const branch = await requireBranchContext(request);
  const { billId } = await context.params;
  const body = await readJson(request);
  const id = requireUuid(billId, 'รหัสบิล');
  const staffName = requireText(body.staffName, 100, 'ชื่อผู้รับสินค้า');
  const result = await rpc<{ purged_bills: number }>('confirm_received', {
    p_branch_id: branch.id,
    p_bill_id: id,
    p_staff_name: staffName,
  });
  // บิลเก่าเกิน 3 ใบอาจถูกลบไปพร้อมกัน — บิลนี้ยังอยู่เสมอ (เพิ่งรับล่าสุด)
  const db = getServiceClient();
  const { data: missing } = await db
    .from('bill_items')
    .select('product_name, product_code, received_note')
    .eq('bill_id', id)
    .eq('is_removed', false)
    .eq('received_state', 'missing');
  const missingList = (missing ?? []) as { product_name: string; product_code: string; received_note: string | null }[];
  await logBranchAction({
    billId: id,
    staffName,
    action: 'status_change',
    before: { status: 'shipped' },
    after: { status: 'received', ...(missingList.length ? { missing_items: missingList.length } : {}) },
  });
  // มีของไม่ครบ → เปิดเรื่อง "บิลมีปัญหา" (เก็บไว้ไม่ลบจนกว่าผู้ดูแลจะปิดเรื่อง) + แจ้งสำนักงานใหญ่ทันที
  if (missingList.length) {
    const summary = missingList.map((item) => `${item.product_name} (${item.product_code}): ${item.received_note ?? '-'}`).join(' · ').slice(0, 1000);
    const { error: issueError } = await db
      .from('bills')
      .update({ issue_status: 'open', issue_summary: summary, issue_opened_at: new Date().toISOString() })
      .eq('id', id);
    if (issueError) console.error('[stock-request] open issue failed', issueError.message);
    const { data: bill } = await db.from('bills').select('bill_no').eq('id', id).maybeSingle();
    const { error: notifyError } = await db.from('notifications').insert({
      audience: 'hq',
      branch_id: branch.id,
      bill_id: id,
      type: 'receive_missing',
      title: `สาขาได้รับของไม่ครบ ${missingList.length} รายการ`,
      body: `${branch.name} · บิล ${bill?.bill_no ?? ''}: ${missingList.map((item) => `${item.product_name} (${item.received_note ?? '-'})`).join(', ')}`.slice(0, 1000),
    });
    if (notifyError) console.error('[stock-request] notify missing failed', notifyError.message);
  }
  if (result.purged_bills > 0) await processStorageCleanup().catch((error) => console.error('[stock-request] cleanup', error));
  return NextResponse.json({ result });
});
