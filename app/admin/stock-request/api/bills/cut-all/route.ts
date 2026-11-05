import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { getBranches, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillRow } from '@/lib/stock-request/types';
import { readJson, requireText } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

export interface CutAllCandidate {
  id: string;
  bill_no: string;
  branch_id: number;
  branch_name: string;
  item_count: number;
}

// บิลรอตัดที่มีรายการ ของสาขาที่ใช้งานอยู่ — บิลว่างไม่ต้องตัด
async function loadCandidates(): Promise<CutAllCandidate[]> {
  const [branches, { data, error }] = await Promise.all([
    getBranches(),
    getServiceClient().from('bills').select('id, bill_no, branch_id, bill_items(count)').eq('status', 'pending').eq('bill_items.is_removed', false),
  ]);
  if (error) throw fromDbError(error);
  const names = new Map(branches.map((branch) => [branch.id, branch.name]));
  const order = new Map(branches.map((branch, index) => [branch.id, index]));
  return ((data ?? []) as (Pick<BillRow, 'id' | 'bill_no' | 'branch_id'> & { bill_items: { count: number }[] })[])
    .map((bill) => ({ id: bill.id, bill_no: bill.bill_no, branch_id: bill.branch_id, branch_name: names.get(bill.branch_id) ?? '', item_count: bill.bill_items?.[0]?.count ?? 0 }))
    .filter((bill) => bill.item_count > 0 && names.has(bill.branch_id))
    .sort((a, b) => order.get(a.branch_id)! - order.get(b.branch_id)!); // ลำดับเดียวกับระบบเบิกสินค้า
}

export const GET = handle(async () => {
  await requireAdmin();
  return NextResponse.json({ bills: await loadCandidates() });
});

// ตัดบิลทุกสาขาพร้อมกัน — ตัดทีละบิลใน transaction ของแต่ละบิล (บิลไหนพลาดไม่กระทบบิลอื่น)
export const POST = handle(async (request: NextRequest) => {
  const admin = await requireAdmin();
  const responsibleName = requireText((await readJson(request)).responsibleName, 100, 'ชื่อผู้รับผิดชอบบิล');
  const candidates = await loadCandidates();
  if (candidates.length === 0) throw new ApiError(409, 'SR_NOTHING_TO_CUT', 'ไม่มีบิลที่รอตัด');

  const db = getServiceClient();
  const cut: { bill_no: string; branch_name: string }[] = [];
  const failed: { bill_no: string; branch_name: string; error: string }[] = [];
  for (const bill of candidates) {
    try {
      // อ่านเวอร์ชันล่าสุดก่อนตัด (สาขาอาจเพิ่มรายการเข้ามาระหว่างนี้) · ชนกันพอดีลองใหม่อีกครั้ง
      for (let attempt = 1; ; attempt += 1) {
        const { data, error } = await db.from('bills').select('version').eq('id', bill.id).single();
        if (error) throw fromDbError(error);
        try {
          await rpc('cut_bill', { p_admin_id: admin.id, p_bill_id: bill.id, p_expected_version: data.version });
          break;
        } catch (err) {
          if (err instanceof ApiError && err.code === 'SR_VERSION_CONFLICT' && attempt < 3) continue;
          throw err;
        }
      }
      const { error } = await db.from('bills').update({ responsible_name: responsibleName }).eq('id', bill.id);
      if (error) console.error('[stock-request] save responsible_name failed', error.message);
      cut.push({ bill_no: bill.bill_no, branch_name: bill.branch_name });
    } catch (err) {
      failed.push({ bill_no: bill.bill_no, branch_name: bill.branch_name, error: err instanceof Error ? err.message : 'ตัดบิลไม่สำเร็จ' });
    }
  }
  return NextResponse.json({ cut, failed });
});
