import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getBillRow, loadBillDetails, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import { readJson, requireText, requireUuid, requireVersion } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ยืนยันจัดส่ง — แยกจากขั้นเช็คของ: ต้องเช็คของครบทุกรายการก่อน และระบุชื่อผู้จัดส่ง
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  const body = await readJson(request);
  const shipperName = requireText(body.shipperName, 100, 'ชื่อผู้จัดส่ง');
  const expectedVersion = requireVersion(body.expectedVersion);

  const [detail] = await loadBillDetails([bill], { photos: false });
  const unchecked = detail.items.filter((item) => !item.is_removed && !item.picked_at).length;
  if (unchecked > 0) throw new ApiError(409, 'SR_NOT_PICKED', `ยังแพ็คของไม่ครบ อีก ${unchecked} รายการ — กรุณาแพ็คของให้ครบก่อนจัดส่ง`);

  const result = await rpc('mark_shipped', { p_admin_id: admin.id, p_bill_id: bill.id, p_expected_version: expectedVersion });
  const { error } = await getServiceClient().from('bills').update({ shipped_name: shipperName }).eq('id', bill.id);
  if (error) throw fromDbError(error);
  return NextResponse.json({ result });
});
