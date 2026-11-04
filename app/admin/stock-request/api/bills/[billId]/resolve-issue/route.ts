import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/stock-request/admin-auth';
import { ApiError, fromDbError, handle } from '@/lib/stock-request/errors';
import { copyItemPhoto, getBillRow, loadBillDetails, rpc } from '@/lib/stock-request/queries';
import { getServiceClient } from '@/lib/stock-request/supabase-admin';
import type { BillRow } from '@/lib/stock-request/types';
import { isUuid, optionalText, readJson, requireText, requireUuid } from '@/lib/stock-request/validation';

export const dynamic = 'force-dynamic';

type CarryInput = { itemId: string; mode: 'same' | 'substitute'; productName?: string; productCode?: string };

// ปิดเรื่องบิลที่มีปัญหา (สาขาแจ้งของไม่ครบ)
// - carry: รายการที่จะ "ยกยอดไปบิลถัดไป" ของสาขา — ตัวเดิม หรือเป็นสินค้าทดแทน (เพิ่มเข้าบิลที่เปิดอยู่ทันที)
// - รายการที่ไม่ยกยอด ให้อธิบายในหมายเหตุ (ส่งแยกแล้ว / ยกเลิก / ตรวจแล้วครบ)
// ต้องระบุหมายเหตุและชื่อผู้ปิดเรื่อง · แจ้งสาขา · บันทึก Audit Log
export const POST = handle(async (request: NextRequest, context: { params: Promise<{ billId: string }> }) => {
  const admin = await requireAdmin();
  const bill = await getBillRow(requireUuid((await context.params).billId, 'รหัสบิล'));
  const body = await readJson(request);
  const resolver = requireText(body.resolverName, 100, 'ชื่อผู้ปิดเรื่อง');
  const extraNote = optionalText(body.note, 1000);
  if (bill.issue_status !== 'open') throw new ApiError(409, 'SR_NO_OPEN_ISSUE', 'บิลนี้ไม่มีปัญหาที่รอแก้ไข');

  // ตรวจรายการที่จะยกยอด — ต้องเป็นรายการที่สาขาแจ้งว่าไม่ได้รับในบิลนี้
  const [detail] = await loadBillDetails([bill], { photos: false });
  const missing = new Map(detail.items.filter((item) => !item.is_removed && item.received_state === 'missing').map((item) => [item.id, item]));
  const carry = (Array.isArray(body.carry) ? body.carry : []) as CarryInput[];
  const plans = carry.map((entry) => {
    const item = isUuid(entry?.itemId) ? missing.get(entry.itemId.toLowerCase()) : undefined;
    if (!item) throw new ApiError(400, 'SR_INVALID_INPUT', 'รายการที่จะยกยอดไม่ถูกต้อง');
    if (entry.mode === 'substitute') {
      return {
        item,
        mode: 'substitute' as const,
        name: requireText(entry.productName, 200, 'ชื่อสินค้าทดแทน'),
        code: requireText(entry.productCode, 100, 'รหัสสินค้าทดแทน'),
      };
    }
    if (entry.mode !== 'same') throw new ApiError(400, 'SR_INVALID_INPUT', 'รูปแบบการยกยอดไม่ถูกต้อง');
    // ตัวเดิม = สิ่งที่ควรได้รับจริง (ถ้าเดิมเป็นสินค้าทดแทน ใช้ตัวทดแทน)
    return { item, mode: 'same' as const, name: item.substitution?.product_name ?? item.product_name, code: item.substitution?.product_code ?? item.product_code };
  });
  if (plans.length === 0 && !extraNote) throw new ApiError(400, 'SR_INVALID_INPUT', 'กรุณาเลือกรายการที่จะยกยอด หรือระบุหมายเหตุการแก้ไขปัญหา');

  // ยกยอดเข้าบิลที่เปิดอยู่ของสาขา (สร้างให้ถ้ายังไม่มี)
  const carried: string[] = [];
  let targetBillNo: string | null = null;
  for (const plan of plans) {
    const photo = plan.mode === 'same' ? await copyItemPhoto(plan.item.substitution?.photo_path ?? plan.item.photo_path, bill.branch_id) : null;
    const hqNote = `ยกยอดจากบิล ${bill.bill_no}${plan.mode === 'substitute' ? ` (ทดแทน ${plan.item.product_name})` : ''}: ${plan.item.received_note ?? '-'}`;
    for (let attempt = 1; ; attempt += 1) {
      const open = await rpc<BillRow>('get_or_open_bill', { p_branch_id: bill.branch_id });
      targetBillNo = open.bill_no;
      try {
        await rpc('hq_add_item', {
          p_admin_id: admin.id,
          p_bill_id: open.id,
          p_expected_version: open.version,
          p_item_id: crypto.randomUUID(),
          p_product_name: plan.name,
          p_product_code: plan.code,
          p_stock_on_hand: plan.item.stock_on_hand,
          p_hq_ship_qty: null,
          p_hq_note: hqNote,
          p_photo_path: photo,
          p_reason: null,
        });
        break;
      } catch (error) {
        // สาขาเพิ่มรายการพร้อมกันพอดี (เวอร์ชันบิลเปลี่ยน) → ลองใหม่
        if (error instanceof ApiError && error.code === 'SR_VERSION_CONFLICT' && attempt < 3) continue;
        throw error;
      }
    }
    carried.push(`${plan.name} (${plan.code})${plan.mode === 'substitute' ? ' [ทดแทน]' : ''}`);
  }

  const note = [carried.length ? `ยกยอดไปบิล ${targetBillNo}: ${carried.join(', ')}` : null, extraNote].filter(Boolean).join(' · ').slice(0, 1000);
  const db = getServiceClient();
  const { data, error } = await db
    .from('bills')
    .update({ issue_status: 'resolved', issue_resolved_note: note, issue_resolved_by: resolver, issue_resolved_at: new Date().toISOString() })
    .eq('id', bill.id)
    .eq('issue_status', 'open') // กันปิดซ้ำพร้อมกัน
    .select('id');
  if (error) throw fromDbError(error);
  if (!data?.length) throw new ApiError(409, 'SR_NO_OPEN_ISSUE', 'บิลนี้ถูกปิดเรื่องไปแล้ว');

  const [audit, notify] = await Promise.all([
    db.from('audit_logs').insert({
      bill_id: bill.id,
      admin_id: admin.id,
      admin_name: `${admin.display_name} · ${resolver}`,
      action: 'status_change',
      before_data: { issue: 'เปิดเรื่อง (ของไม่ครบ)' },
      after_data: { issue: carried.length ? 'ยกยอดไปบิลถัดไป' : 'ปิดเรื่องแล้ว' },
      reason: note,
      after_billing: true,
    }),
    db.from('notifications').insert({
      audience: 'branch',
      branch_id: bill.branch_id,
      bill_id: bill.id,
      type: 'issue_resolved',
      title: carried.length ? 'ยกยอดของที่ขาดไปบิลถัดไปแล้ว' : 'สำนักงานใหญ่แก้ไขปัญหาบิลแล้ว',
      body: `บิล ${bill.bill_no}: ${note} (โดย ${resolver})`.slice(0, 1000),
    }),
  ]);
  if (audit.error) console.error('[stock-request] resolve audit failed', audit.error.message);
  if (notify.error) console.error('[stock-request] resolve notify failed', notify.error.message);
  return NextResponse.json({ ok: true, carriedTo: targetBillNo, carried: carried.length });
});
