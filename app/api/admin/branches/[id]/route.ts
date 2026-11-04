import { NextResponse } from 'next/server';
import { dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { parseBranchId } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลบสาขา — ถ้าสาขามีบิลในระบบแจ้งสินค้าใกล้หมด ฐานข้อมูลจะไม่ให้ลบ (FK restrict)
export const DELETE = handle(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = parseBranchId((await context.params).id);
  if (!id) throw new ApiError(400, 'INVALID_INPUT', 'รหัสสาขาไม่ถูกต้อง');
  const { data, error } = await serviceDb().from('branches').delete().eq('id', id).select('id');
  if (error) throw dbError(error, 'ลบสาขาไม่สำเร็จ');
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบสาขานี้');
  return NextResponse.json({ ok: true });
});
