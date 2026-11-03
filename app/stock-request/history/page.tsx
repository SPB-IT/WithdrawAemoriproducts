'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuditList, StatusTimeline, SubstitutionPair } from '@/components/stock-request/BillParts';
import BranchShell, { useBranch } from '@/components/stock-request/BranchShell';
import StaffNameField, { readRecentStaff, saveRecentStaff, useBranchStaffNames } from '@/components/stock-request/StaffNameField';
import { ConfirmDialog, EmptyState, ErrorState, InlineError, LoadingState, PhotoThumb, StatusBadge, primaryButton } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillDetail } from '@/lib/stock-request/types';

export default function HistoryPage() {
  return (
    <BranchShell>
      <History />
    </BranchShell>
  );
}

// ประวัติ 3 บิลล่าสุด — ดูอย่างเดียว (ไม่มีปุ่มพิมพ์) + ยืนยันรับสินค้าเมื่อจัดส่งแล้ว
function History() {
  const { branch } = useBranch();
  const [staffName, setStaffName] = useState('');
  const [recentStaff, setRecentStaff] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<BillDetail | null>(null);
  const knownStaff = useBranchStaffNames(Boolean(confirming));
  const [bills, setBills] = useState<BillDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ bills: BillDetail[] }>('/api/stock-request/branch/history');
      setBills(data.bills);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const receive = async () => {
    if (!confirming) return;
    if (!staffName.trim()) return setActionError('กรุณากรอกชื่อผู้รับสินค้า');
    setBusy(true);
    setActionError(null);
    try {
      await apiFetch(`/api/stock-request/branch/bills/${confirming.id}/receive`, { method: 'POST', json: { staffName: staffName.trim() } });
      saveRecentStaff(branch.id, staffName.trim());
      setConfirming(null);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const openReceive = (bill: BillDetail) => {
    const recent = readRecentStaff(branch.id);
    setRecentStaff(recent);
    setStaffName(recent[0] ?? '');
    setActionError(null);
    setConfirming(bill);
  };

  if (error && !bills) return <ErrorState message={error} onRetry={load} />;
  if (!bills) return <LoadingState label="กำลังโหลดประวัติ..." />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">แสดง 3 บิลล่าสุดที่สำนักงานใหญ่ตัดบิลแล้ว เรียงจากใหม่ไปเก่า</p>
      {bills.length === 0 ? (
        <EmptyState icon="🗂️" title="ยังไม่มีประวัติบิล" description="เมื่อสำนักงานใหญ่ตัดบิลแล้ว บิลจะมาแสดงที่นี่เพื่อติดตามสถานะ" />
      ) : (
        bills.map((bill) => <HistoryBill key={bill.id} bill={bill} onReceive={() => openReceive(bill)} />)
      )}

      <ConfirmDialog
        open={Boolean(confirming)}
        title="ยืนยันรับสินค้า"
        confirmLabel="ได้รับสินค้าครบแล้ว"
        busy={busy}
        onCancel={() => setConfirming(null)}
        onConfirm={receive}
        message={
          <>
            ยืนยันว่าสาขาได้รับสินค้าตามบิล <span className="font-mono font-bold">{confirming?.bill_no}</span> แล้ว
            <br />
            ระบบจะบันทึกชื่อผู้รับและเวลาปัจจุบัน
          </>
        }
      >
        <div className="space-y-3">
          <StaffNameField label="ชื่อผู้รับสินค้า" value={staffName} onChange={setStaffName} recent={recentStaff} known={knownStaff} />
          <InlineError message={actionError} />
        </div>
      </ConfirmDialog>
    </div>
  );
}

function HistoryBill({ bill, onReceive }: { bill: BillDetail; onReceive: () => void }) {
  const [open, setOpen] = useState(bill.status === 'shipped');
  const items = bill.items.filter((item) => !item.is_removed);
  const removed = bill.items.filter((item) => item.is_removed);
  const itemNames = useMemo(() => new Map(bill.items.map((item) => [item.id, item.product_name])), [bill.items]);

  return (
    <section className="overflow-hidden rounded-3xl border border-slate-100 bg-white shadow-sm">
      <button type="button" onClick={() => setOpen((value) => !value)} className="flex w-full items-start justify-between gap-3 p-4 text-left">
        <div>
          <p className="font-mono text-base font-black text-slate-800">{bill.bill_no}</p>
          <p className="text-xs text-slate-500">
            สร้าง {formatDateTime(bill.created_at)} · {items.length} รายการ
          </p>
        </div>
        <div className="flex flex-col items-end gap-1">
          <StatusBadge status={bill.status} />
          <span className="text-xs text-slate-400">{open ? 'ซ่อน ▲' : 'ดูรายละเอียด ▼'}</span>
        </div>
      </button>

      <div className="border-t border-slate-50 px-4 py-4">
        <StatusTimeline bill={bill} />
        {bill.status === 'shipped' && (
          <button type="button" onClick={onReceive} className={`${primaryButton} mt-4 w-full bg-none bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600`}>
            📦 ยืนยันได้รับสินค้าแล้ว
          </button>
        )}
      </div>

      {open && (
        <div className="space-y-4 border-t border-slate-50 bg-slate-50/40 px-4 py-4">
          <ul className="space-y-2.5">
            {items.map((item) => (
              <li key={item.id} className="rounded-2xl bg-white p-3 ring-1 ring-slate-100">
                <div className="flex gap-3">
                  <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-16 w-16" />
                  <div className="min-w-0 flex-1 text-sm">
                    <p className="font-bold text-slate-800">{item.product_name}</p>
                    <p className="text-xs text-slate-500">รหัส {item.product_code}</p>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-0.5 text-xs">
                      <span>
                        คงเหลือที่แจ้ง <b>{formatNumber(item.stock_on_hand)}</b>
                      </span>
                      <span className="text-pink-700">
                        HQ จัดส่ง <b>{item.substitution ? `${formatNumber(item.substitution.ship_qty)} (ทดแทน)` : formatNumber(item.hq_ship_qty)}</b>
                      </span>
                    </div>
                    {item.staff_note && <p className="mt-1 text-xs text-slate-500">📝 {item.staff_note}</p>}
                    {item.hq_note && <p className="mt-1 text-xs text-sky-700">💬 HQ: {item.hq_note}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{item.source === 'hq' ? 'สำนักงานใหญ่เพิ่ม' : `โดย ${item.reported_by_name}`}</p>
                  </div>
                </div>
                <SubstitutionPair item={item} />
              </li>
            ))}
          </ul>

          {removed.length > 0 && (
            <div>
              <p className="mb-1.5 text-xs font-bold text-slate-500">รายการที่สำนักงานใหญ่นำออก</p>
              <ul className="space-y-1">
                {removed.map((item) => (
                  <li key={item.id} className="rounded-lg bg-white px-3 py-2 text-xs text-slate-400 line-through ring-1 ring-slate-100">
                    {item.product_name} ({item.product_code})
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-500">ประวัติการแก้ไขจากสำนักงานใหญ่</p>
            <AuditList logs={bill.audit_logs} itemNames={itemNames} />
          </div>
        </div>
      )}
    </section>
  );
}
