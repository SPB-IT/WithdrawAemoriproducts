import { NextResponse } from 'next/server';
import { assertUniqueCode, parseItemInput } from '@/lib/requisition-items';
import { dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ id: string }> };

// แก้ไขสินค้า — ส่งทั้งฟอร์ม หรือส่งเฉพาะ { is_active } เพื่อเปิด/ปิดใช้งาน
export const PATCH = handle(async (request: Request, context: Context) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสสินค้า');
  const body = await readJson(request);

  let patch: Record<string, unknown>;
  if (Object.keys(body).length === 1 && typeof body.is_active === 'boolean') {
    patch = { is_active: body.is_active };
  } else {
    const input = parseItemInput(body);
    await assertUniqueCode(input.product_code, id);
    patch = { ...input };
  }

  const { data, error } = await serviceDb().from('items').update(patch).eq('id', id).select('id');
  if (error) throw dbError(error, 'บันทึกไม่สำเร็จ');
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบสินค้านี้');
  return NextResponse.json({ ok: true });
});

export const DELETE = handle(async (_request: Request, context: Context) => {
  await requireAdminApi();
  const id = requireUuid((await context.params).id, 'รหัสสินค้า');
  const { data, error } = await serviceDb().from('items').delete().eq('id', id).select('id');
  if (error) throw dbError(error, 'ลบไม่สำเร็จ (สินค้าที่เคยถูกเบิกแล้ว แนะนำให้ปิดใช้งานแทน)');
  if (!data?.length) throw new ApiError(404, 'NOT_FOUND', 'ไม่พบสินค้านี้');
  return NextResponse.json({ ok: true });
});
