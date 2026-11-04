import { NextResponse } from 'next/server';
import { dbError, requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { clearBranchCache } from '@/lib/stock-request/queries';
import { readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// เพิ่มสาขา (หลังบ้าน → คลังสินค้า) — ชื่อสาขาห้ามซ้ำ
export const POST = handle(async (request: Request) => {
  await requireAdminApi();
  const name = requireText((await readJson(request)).name, 200, 'ชื่อสาขา');
  const db = serviceDb();
  const { data: existing, error: findError } = await db.from('branches').select('id, archived_at').eq('name', name).maybeSingle();
  if (findError) throw dbError(findError, 'ตรวจชื่อสาขาไม่สำเร็จ');
  if (existing && !existing.archived_at) throw new ApiError(409, 'DUPLICATE', 'มีสาขาชื่อนี้อยู่แล้ว');
  if (existing) {
    // เพิ่มชื่อสาขาที่เคยซ่อนไว้ = กู้คืน (ประวัติบิลเดิมกลับมา)
    const { error } = await db.from('branches').update({ archived_at: null }).eq('id', existing.id);
    if (error) throw dbError(error, 'กู้คืนสาขาไม่สำเร็จ');
    clearBranchCache();
    return NextResponse.json({ ok: true, restored: true });
  }
  const { error } = await db.from('branches').insert({ name });
  if (error) throw dbError(error, 'เพิ่มสาขาไม่สำเร็จ');
  return NextResponse.json({ ok: true });
});
