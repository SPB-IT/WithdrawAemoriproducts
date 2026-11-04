'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import ShipDialog from '@/components/stock-request/ShipDialog';
import { EmptyState, ErrorState, LoadingState } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';

interface PickingBill {
  id: string;
  bill_no: string;
  branch_name: string;
  billed_at: string | null;
  total: number;
  picked: number;
  version: number;
  checkers: string[];
}

const REFRESH_MS = 15_000;

// แพ็คของ: บิลที่ตัดแล้วรอแพ็คของ (เก่าก่อน) — แตะเพื่อเปิดรายการไปเช็คของในคลัง
export default function PickingListPage() {
  const [bills, setBills] = useState<PickingBill[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [shipping, setShipping] = useState<PickingBill | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBills((await apiFetch<{ bills: PickingBill[] }>('/admin/stock-request/api/picking')).bills);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (error && !bills) return <ErrorState message={error} onRetry={load} />;
  if (!bills) return <LoadingState label="กำลังโหลดบิลที่รอแพ็คของ..." />;

  return (
    <div className="mx-auto max-w-2xl space-y-4">
      <div>
        <h1 className="text-2xl font-black">📦 แพ็คของ</h1>
        <p className="text-sm text-slate-500">บิลที่ตัดแล้วรอแพ็คของ เรียงจากตัดบิลก่อน · แตะบิลเพื่อเริ่มแพ็ค (ติ๊กทีละรายการ) · แพ็คครบแล้วกด “จัดส่ง”</p>
      </div>
      {notice && <p className="rounded-xl bg-emerald-50 px-4 py-2.5 text-sm font-bold text-emerald-700">✅ {notice}</p>}
      {bills.length === 0 ? (
        <EmptyState icon="✅" title="ไม่มีบิลที่รอแพ็คของ" description="เมื่อสำนักงานใหญ่ตัดบิลแล้ว บิลจะมาแสดงที่นี่" />
      ) : (
        <ul className="space-y-3">
          {bills.map((bill) => {
            const done = bill.total > 0 && bill.picked === bill.total;
            const percent = bill.total ? Math.round((bill.picked / bill.total) * 100) : 0;
            return (
              <li key={bill.id}>
                <Link href={`/admin/stock-request/bills/${bill.id}/pick`} className="block rounded-2xl border border-pink-100 bg-white p-4 shadow-sm transition hover:border-pink-300 hover:shadow-md active:scale-[0.99]">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-base font-black text-slate-800">{bill.branch_name}</p>
                      <p className="font-mono text-xs text-slate-500">{bill.bill_no}</p>
                      <p className="text-[11px] text-slate-400">ตัดบิล {formatDateTime(bill.billed_at)}</p>
                    </div>
                    <span className={`shrink-0 rounded-full px-3 py-1 text-sm font-black ${done ? 'bg-emerald-100 text-emerald-700' : 'bg-pink-100 text-pink-700'}`}>
                      {done ? '✓ ครบแล้ว' : `${bill.picked}/${bill.total}`}
                    </span>
                  </div>
                  <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-slate-100">
                    <div className={`h-full rounded-full transition-all ${done ? 'bg-emerald-500' : 'bg-linear-to-r from-pink-500 to-rose-400'}`} style={{ width: `${percent}%` }} />
                  </div>
                </Link>
                {done && (
                  <button
                    type="button"
                    onClick={() => setShipping(bill)}
                    className="mt-2 w-full rounded-2xl bg-linear-to-r from-pink-500 to-rose-500 py-3 text-base font-black text-white shadow-md transition hover:shadow-lg"
                  >
                    🚚 จัดส่ง
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <ShipDialog
        open={!!shipping}
        billNo={shipping?.bill_no ?? ''}
        summary={shipping ? `${shipping.branch_name} · แพ็คของเสร็จ ${shipping.picked} รายการ${shipping.checkers.length ? ` (แพ็คโดย ${shipping.checkers.join(', ')})` : ''}` : ''}
        onClose={() => setShipping(null)}
        onShip={async (shipperName) => {
          if (!shipping) return;
          await apiFetch(`/admin/stock-request/api/bills/${shipping.id}/ship`, { method: 'POST', json: { expectedVersion: shipping.version, shipperName } });
          setNotice(`บิล ${shipping.bill_no} (${shipping.branch_name}) จัดส่งแล้ว`);
          setShipping(null);
          await load();
        }}
      />
    </div>
  );
}
