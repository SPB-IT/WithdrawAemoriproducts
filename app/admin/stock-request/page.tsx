'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PhotoThumb, StatusBadge } from '@/components/stock-request/ui';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/stock-request/constants';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillStatus } from '@/lib/stock-request/types';

interface DashboardData {
  branchCount: number;
  statusCounts: Record<BillStatus, number>;
  pendingWithItems: { id: string; bill_no: string; branch_name: string; item_count: number; created_at: string; updated_at: string }[];
  latest: {
    id: string;
    bill_id: string;
    bill_no: string;
    bill_status: BillStatus;
    branch_name: string;
    product_name: string;
    product_code: string;
    stock_on_hand: number | null;
    reported_by_name: string;
    created_at: string;
    photo_url: string | null;
  }[];
}

// การ์ดสีพาสเทลแบบเดียวกับแดชบอร์ดระบบเบิกสินค้า: [กรอบ+พื้น, สีหัวข้อ, สีลิงก์]
const CARD_STYLE: Record<BillStatus, [string, string, string]> = {
  pending: ['border-amber-100 bg-amber-50', 'text-amber-700', 'text-amber-600'],
  billed: ['border-sky-100 bg-sky-50', 'text-sky-700', 'text-sky-600'],
  shipped: ['border-pink-100 bg-pink-50', 'text-pink-700', 'text-pink-600'],
  received: ['border-emerald-100 bg-emerald-50', 'text-emerald-700', 'text-emerald-600'],
};

const CARD_LABEL: Record<BillStatus, string> = {
  pending: 'บิลที่รอตัด (มีรายการ)',
  billed: 'ตัดบิลแล้ว · รอจัดส่ง',
  shipped: 'กำลังจัดส่ง',
  received: 'ได้รับสินค้าแล้ว',
};

export default function HqDashboardPage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setData(await apiFetch<DashboardData>('/admin/stock-request/api/dashboard'));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, 60_000);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  if (error && !data) return <ErrorState message={error} onRetry={load} />;
  if (!data) return <LoadingState />;

  const counts: Record<BillStatus, number> = { ...data.statusCounts, pending: data.pendingWithItems.length };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-2xl font-black">ภาพรวม</h1>
          <p className="text-sm text-slate-500">ข้อมูลบิลแจ้งสินค้าใกล้หมดจากทุกสาขา (อัปเดตอัตโนมัติทุก 1 นาที)</p>
        </div>
        <button type="button" onClick={load} className="text-sm font-bold text-pink-600 hover:underline">
          รีเฟรช
        </button>
      </div>

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-500">สาขาทั้งหมด</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatNumber(data.branchCount)}</p>
        </div>
        {STATUS_ORDER.map((status) => {
          const [box, title, link] = CARD_STYLE[status];
          return (
            <Link key={status} href={`/admin/stock-request/bills?status=${status}`} className={`rounded-2xl border ${box} p-5 transition-all hover:-translate-y-0.5 hover:shadow-md`}>
              <p className={`text-xs font-black ${title}`}>{CARD_LABEL[status]}</p>
              <p className="mt-2 text-3xl font-black text-slate-800">{formatNumber(counts[status])}</p>
              <p className={`mt-1 text-xs font-semibold ${link}`}>ดูบิล →</p>
            </Link>
          );
        })}
      </section>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.4fr]">
        <section className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-black text-slate-700">สาขาที่มีรายการรอตัดบิล</h2>
          {data.pendingWithItems.length === 0 ? (
            <EmptyState icon="✅" title="ไม่มีบิลรอตัด" description="ยังไม่มีสาขาใดเพิ่มรายการเข้ามา" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.pendingWithItems.map((bill) => (
                <li key={bill.id}>
                  <Link href={`/admin/stock-request/bills/${bill.id}`} className="flex items-center justify-between gap-3 py-3 hover:bg-slate-50">
                    <div>
                      <p className="text-sm font-bold text-slate-800">{bill.branch_name}</p>
                      <p className="font-mono text-xs text-slate-500">{bill.bill_no}</p>
                      <p className="text-[11px] text-slate-400">รายการล่าสุด {formatDateTime(bill.updated_at)}</p>
                    </div>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-sm font-black text-amber-700">{bill.item_count} รายการ</span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
          <h2 className="mb-3 text-sm font-black text-slate-700">รายการเบิกใหม่ล่าสุด</h2>
          {data.latest.length === 0 ? (
            <EmptyState icon="📭" title="ยังไม่มีรายการ" />
          ) : (
            <ul className="divide-y divide-slate-100">
              {data.latest.map((item) => (
                <li key={item.id}>
                  <Link href={`/admin/stock-request/bills/${item.bill_id}`} className="flex items-center gap-3 py-2.5 hover:bg-slate-50">
                    <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-12 w-12" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-bold text-slate-800">{item.product_name}</p>
                      <p className="truncate text-xs text-slate-500">
                        {item.branch_name} · {item.product_code} · คงเหลือ {formatNumber(item.stock_on_hand)}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {item.reported_by_name} · {formatDateTime(item.created_at)}
                      </p>
                    </div>
                    <StatusBadge status={item.bill_status} className="hidden sm:inline-flex" />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
      <p className="text-center text-xs text-slate-400">สถานะ: {STATUS_ORDER.map((status) => STATUS_LABEL[status]).join(' → ')}</p>
    </div>
  );
}
