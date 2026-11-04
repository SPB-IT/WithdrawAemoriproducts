import { NextResponse } from 'next/server';
import { assertUniqueCode, parseItemInput } from '@/lib/requisition-items';
import { dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { handle } from '@/lib/stock-request/errors';
import { readJson } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// เพิ่มสินค้าใหม่ (หลังบ้าน → คลังสินค้า)
export const POST = handle(async (request: Request) => {
  await requireAdminApi();
  const input = parseItemInput(await readJson(request));
  await assertUniqueCode(input.product_code);
  const { data, error } = await serviceDb().from('items').insert(input).select('id').single();
  if (error) throw dbError(error, 'เพิ่มสินค้าไม่สำเร็จ');
  return NextResponse.json({ id: data.id });
});
