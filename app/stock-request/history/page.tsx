'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AuditList, IssueBadge, IssueBanner, QtyLine, RemovedItems, StatusTimeline, SubstitutionPair } from '@/components/stock-request/BillParts';
import BranchShell from '@/components/stock-request/BranchShell';
import { EmptyState, ErrorState, LoadingState, PhotoThumb, StatusBadge, primaryButton, secondaryButton } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import type { BillDetail } from '@/lib/stock-request/types';

export default function HistoryPage() {
  return (
    <BranchShell>
      <History />
    </BranchShell>
  );
}

// ประวัติ 3 บิลล่าสุด — ดูอย่างเดียว · บิลที่จัดส่งแล้วไปหน้าเช็คของเพื่อยืนยันรับ · ทุกบิลส่งออก PDF ได้
function History() {
  const [bills, setBills] = useState<BillDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

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

  if (error && !bills) return <ErrorState message={error} onRetry={load} />;
  if (!bills) return <LoadingState label="กำลังโหลดประวัติ..." />;

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-500">แสดง 3 บิลล่าสุดที่สำนักงานใหญ่ตัดบิลแล้ว เรียงจากใหม่ไปเก่า</p>
      {bills.length === 0 ? (
        <EmptyState icon="🗂️" title="ยังไม่มีประวัติบิล" description="เมื่อสำนักงานใหญ่ตัดบิลแล้ว บิลจะมาแสดงที่นี่เพื่อติดตามสถานะ" />
      ) : (
        bills.map((bill) => <HistoryBill key={bill.id} bill={bill} />)
      )}
    </div>
  );
}

function HistoryBill({ bill }: { bill: BillDetail }) {
  const [open, setOpen] = useState(bill.status === 'shipped');
  const items = bill.items.filter((item) => !item.is_removed);
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
          <IssueBadge bill={bill} />
          <span className="text-xs text-slate-400">{open ? 'ซ่อน ▲' : 'ดูรายละเอียด ▼'}</span>
        </div>
      </button>

      <div className="border-t border-slate-50 px-4 py-4">
        <StatusTimeline bill={bill} />
        {bill.issue_status && (
          <div className="mt-3">
            <IssueBanner bill={bill} />
          </div>
        )}
        {bill.status === 'shipped' ? (
          <Link href={`/stock-request/receive/${bill.id}`} className={`${primaryButton} mt-4 w-full bg-none bg-emerald-500 shadow-emerald-200 hover:bg-emerald-600`}>
            📦 เช็คของ / ยืนยันรับสินค้า
          </Link>
        ) : (
          <Link href={`/stock-request/receive/${bill.id}`} className={`${secondaryButton} mt-4 w-full`}>
            📄 รายการและผลเช็คของ / ส่งออก PDF
          </Link>
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
                    <QtyLine bill={bill} item={item} />
                    {item.staff_note && <p className="mt-1 text-xs text-slate-500">📝 {item.staff_note}</p>}
                    {item.hq_note && <p className="mt-1 text-xs text-sky-700">💬 HQ: {item.hq_note}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">{item.source === 'hq' ? 'สำนักงานใหญ่เพิ่ม' : `โดย ${item.reported_by_name}`}</p>
                  </div>
                </div>
                <SubstitutionPair item={item} />
              </li>
            ))}
          </ul>

          <RemovedItems bill={bill} />

          <div>
            <p className="mb-1.5 text-xs font-bold text-slate-500">ประวัติการแก้ไขจากสำนักงานใหญ่</p>
            <AuditList logs={bill.audit_logs} itemNames={itemNames} />
          </div>
        </div>
      )}
    </section>
  );
}
