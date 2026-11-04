import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { readJson, requireText, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ตัดบิล — ทั้งหมดทำใน transaction เดียวใน database (ล็อกบิล, กันตัดซ้ำ, snapshot, เปิดบิลใหม่)
// แล้วบันทึกชื่อผู้รับผิดชอบบิล (ผู้ดูแลใช้รหัสกลางร่วมกัน จึงต้องระบุชื่อคนจริง)
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const { billId } = await context.params;
  const body = await readJson(request);
  const id = requireUuid(billId, 'รหัสบิล');
  const responsibleName = requireText(body.responsibleName, 100, 'ชื่อผู้รับผิดชอบบิลนี้'); // ตรวจก่อนตัดบิล
  const result = await rpc<{ bill_id: string; bill_no: string; new_bill_no: string }>('cut_bill', {
    p_admin_id: admin.id,
    p_bill_id: id,
    p_expected_version: requireVersion(body.expectedVersion),
  });
  const { error } = await getServiceClient().from('bills').update({ responsible_name: responsibleName }).eq('id', id);
  if (error) console.error('[stock-request] save responsible_name failed', { code: error.code, message: error.message });
  return NextResponse.json({ result });
});
