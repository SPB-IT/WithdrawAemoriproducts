'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, PhotoThumb, StatusBadge } from '@/components/stock-request/ui';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/stock-request/constants';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillStatus } from '@/lib/stock-request/types';

interface StockSummary {
  reportedItems: number;
  reportedBranches: number;
  orderedQty: number;
  toPack: number;
  toPackBills: number;
  packedBillsReady: number;
  shortages: number;
  topProducts: { product_code: string; product_name: string; total_qty: number; branches: { name: string; stock: number | null }[] }[];
  shortageList: { kind: 'missing' | 'no_stock' | 'partial'; id: string; bill_id: string; bill_no: string; branch_name: string; product_name: string; product_code: string; note: string | null }[];
}

interface DashboardData {
  stock: StockSummary;
  branchCount: number;
  openIssues: number;
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
  billed: 'ตัดบิลแล้ว · รอแพ็ค/จัดส่ง',
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

      <section className="grid grid-cols-2 gap-3 lg:grid-cols-3">
        <div className="rounded-2xl border border-slate-100 bg-white p-5 shadow-sm">
          <p className="text-xs font-black text-slate-500">สาขาทั้งหมด</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatNumber(data.branchCount)}</p>
        </div>
        <Link
          href="/admin/stock-request/branches"
          className={`rounded-2xl border p-5 transition-all hover:-translate-y-0.5 hover:shadow-md ${data.openIssues ? 'border-rose-200 bg-rose-50' : 'border-slate-100 bg-white'}`}
        >
          <p className={`text-xs font-black ${data.openIssues ? 'text-rose-700' : 'text-slate-500'}`}>⚠️ บิลมีปัญหา (ของไม่ครบ)</p>
          <p className="mt-2 text-3xl font-black text-slate-800">{formatNumber(data.openIssues)}</p>
          <p className={`mt-1 text-xs font-semibold ${data.openIssues ? 'text-rose-600' : 'text-slate-400'}`}>ดูบิลที่มีปัญหา →</p>
        </Link>
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

      <StockSection stock={data.stock} />

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
          <h2 className="mb-3 text-sm font-black text-slate-700">รายการที่สาขาแจ้งล่าสุด</h2>
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
                        {item.branch_name} · {item.product_code} · สั่ง {formatNumber(item.stock_on_hand)} ชิ้น
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

// สรุปสินค้า: แจ้งใกล้หมดรอบนี้ / หมดที่สาขา / รอแพ็ค / ของขาด + รายการสินค้าที่หลายสาขาแจ้ง และรายการของขาด
function StockSection({ stock }: { stock: StockSummary }) {
  const cards = [
    { icon: '📝', label: 'สินค้าที่แจ้งรอบนี้', value: stock.reportedItems, sub: `จาก ${stock.reportedBranches} สาขา · ยังไม่ตัดบิล`, tone: 'border-amber-100 bg-amber-50 text-amber-700', href: '/admin/stock-request/bills?status=pending' },
    { icon: '🧮', label: 'จำนวนที่สาขาสั่งรวม', value: stock.orderedQty, sub: 'ชิ้น · รอบนี้ (ยังไม่ตัดบิล)', tone: 'border-pink-100 bg-pink-50 text-pink-700', href: '/admin/stock-request/bills?status=pending' },
    { icon: '📦', label: 'รอแพ็คของ', value: stock.toPack, sub: stock.toPack ? `ใน ${stock.toPackBills} บิล${stock.packedBillsReady ? ` · แพ็คเสร็จรอส่ง ${stock.packedBillsReady} บิล` : ''}` : stock.packedBillsReady ? `แพ็คเสร็จรอส่ง ${stock.packedBillsReady} บิล` : 'ไม่มีของค้างแพ็ค', tone: 'border-sky-100 bg-sky-50 text-sky-700', href: '/admin/stock-request/pick' },
    { icon: '❌', label: 'ของขาด / ส่งไม่ครบ', value: stock.shortages, sub: 'สาขาไม่ได้รับ + ไม่มีของ + ส่งได้ไม่ครบ', tone: stock.shortages ? 'border-rose-200 bg-rose-50 text-rose-700' : 'border-slate-100 bg-white text-slate-500', href: '/admin/stock-request/branches' },
  ];

  return (
    <section className="space-y-3">
      <h2 className="text-base font-black text-slate-800">📊 สรุปสินค้า</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <Link key={card.label} href={card.href} className={`rounded-2xl border p-4 transition-all hover:-translate-y-0.5 hover:shadow-md ${card.tone}`}>
            <p className="text-xs font-black">
              {card.icon} {card.label}
            </p>
            <p className="mt-1.5 text-3xl font-black text-slate-800">{formatNumber(card.value)}</p>
            <p className="mt-0.5 text-[11px] font-semibold opacity-80">{card.sub}</p>
          </Link>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-black text-slate-700">🔥 สินค้าที่สาขาแจ้งใกล้หมด (รอบนี้)</h3>
          <p className="mb-3 text-[11px] text-slate-400">เรียงจากจำนวนสาขาที่สั่ง และจำนวนรวมที่สั่ง</p>
          {stock.topProducts.length === 0 ? (
            <EmptyState icon="✅" title="ยังไม่มีสาขาแจ้งรอบนี้" />
          ) : (
            <ul className="space-y-2">
              {stock.topProducts.map((product) => (
                <li key={product.product_code} className="rounded-xl bg-slate-50 p-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-bold text-slate-800">{product.product_name}</p>
                      <p className="font-mono text-[11px] text-slate-400">{product.product_code}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span className="rounded-full bg-pink-100 px-2.5 py-0.5 text-[11px] font-black text-pink-700">{product.branches.length} สาขา</span>
                      <span className="text-[11px] font-black text-slate-600">สั่งรวม {formatNumber(product.total_qty)} ชิ้น</span>
                    </div>
                  </div>
                  <p className="mt-1 line-clamp-2 text-[11px] text-slate-500">
                    {product.branches.map((branch) => `${branch.name} สั่ง ${branch.stock ?? '-'}`).join(' · ')}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
          <h3 className="mb-1 text-sm font-black text-slate-700">❌ ของขาด / ส่งไม่ครบ</h3>
          <p className="mb-3 text-[11px] text-slate-400">สาขาแจ้งว่าไม่ได้รับ (ปัญหายังไม่ปิด) ของที่ไม่มีส่ง และของที่ส่งได้ไม่ครบในบิลรอบนี้</p>
          {stock.shortageList.length === 0 ? (
            <EmptyState icon="✅" title="ไม่มีของขาด" />
          ) : (
            <ul className="space-y-2">
              {stock.shortageList.map((item) => (
                <li key={item.id}>
                  <Link href={`/admin/stock-request/bills/${item.bill_id}`} className="block rounded-xl bg-slate-50 p-2.5 transition hover:bg-pink-50">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-bold text-slate-800">{item.product_name}</p>
                        <p className="text-[11px] text-slate-500">
                          {item.branch_name} · <span className="font-mono">{item.bill_no}</span>
                        </p>
                      </div>
                      <span
                        className={`shrink-0 rounded-full px-2.5 py-0.5 text-[11px] font-black ${item.kind === 'missing' ? 'bg-rose-100 text-rose-700' : item.kind === 'partial' ? 'bg-amber-100 text-amber-800' : 'bg-slate-200 text-slate-600'}`}
                      >
                        {item.kind === 'missing' ? 'สาขาไม่ได้รับ' : item.kind === 'partial' ? 'ส่งได้ไม่ครบ' : 'ไม่มีของส่ง'}
                      </span>
                    </div>
                    {item.note && <p className="mt-1 line-clamp-2 text-[11px] text-rose-600">📝 {item.note}</p>}
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
