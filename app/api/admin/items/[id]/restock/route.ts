import { NextResponse } from 'next/server';
import { changeStock, dbError, requireAdminApi } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// รับสินค้าเข้าคลัง (เพิ่มจำนวนคงเหลือ)
export const POST = handle(async (request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสสินค้า');
  const { amount } = await readJson(request);
  if (typeof amount !== 'number' || !Number.isInteger(amount) || amount <= 0 || amount > 1_000_000) {
    throw new ApiError(400, 'INVALID_INPUT', 'กรุณากรอกจำนวนที่รับเข้ามากกว่า 0');
  }
  const error = await changeStock(id, amount, 'increment');
  if (error) throw dbError(error, 'รับสินค้าเข้าคลังไม่สำเร็จ');
  return NextResponse.json({ ok: true });
});
