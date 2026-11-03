import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { handle } from '@/lib/stock-request/errors';
import { createUploadTarget, getBillRow } from '@/lib/stock-request/queries';
import { readJson, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

// รูปที่ HQ อัปโหลด (สินค้าที่เพิ่มเอง / สินค้าทดแทน) เก็บในโฟลเดอร์ของสาขาเจ้าของบิล
export const POST = handle(async (request: NextRequest) => {
  await requireAdmin();
  const body = await readJson(request);
  const bill = await getBillRow(requireUuid(body.billId, 'รหัสบิล'));
  return NextResponse.json(await createUploadTarget(bill.branch_id));
});
