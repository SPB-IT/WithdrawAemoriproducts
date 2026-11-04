import { NextResponse } from 'next/server';
import { dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { optionalText, readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ปฏิเสธรายการสินค้าในใบเบิก (reason) หรือยกเลิกการปฏิเสธ (reason = null)
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสรายการ');
  const body = await readJson(request);
  const reason = optionalText(body.reason, 500);

  const { data, error } = await serviceDb().from('requisition_details').update({ rejection_reason: reason }).eq('id', id).select('id');
  if (error) throw dbError(error, 'บันทึกไม่สำเร็จ');
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบรายการนี้');
  return NextResponse.json({ ok: true, reason });
});
