import { NextResponse } from 'next/server';
import { requireAdminApi } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';
import { clearBranchCache, rpc } from '@/lib/stock-request/queries';
import { parseBranchId } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// ลบสาขา — ถ้าสาขามีประวัติบิลในระบบแจ้งสินค้าใกล้หมด จะ "เก็บถาวร" (ซ่อนจากทุกรายการ ประวัติยังอยู่)
// ถ้าไม่มีประวัติ (มีแค่บิลว่างที่ระบบเปิดให้อัตโนมัติ) จะลบจริง
export const DELETE = handle(async (_request: Request, context: { params: Promise<{ id: string }> }) => {
  await requireAdminApi();
  const id = parseBranchId((await context.params).id);
  if (!id) throw new ApiError(400, 'INVALID_INPUT', 'รหัสสาขาไม่ถูกต้อง');
  const result = await rpc<'deleted' | 'archived'>('admin_remove_branch', { p_branch_id: id });
  clearBranchCache();
  return NextResponse.json({ ok: true, result });
});
