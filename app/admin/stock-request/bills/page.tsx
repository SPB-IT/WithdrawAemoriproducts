'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { IssueBadge } from '@/components/stock-request/BillParts';
import CutAllPanel from '@/components/stock-request/CutAllPanel';
import { EmptyState, ErrorState, InlineError, LoadingState, Spinner, StatusBadge, inputClass, secondaryButton } from '@/components/stock-request/ui';
import { STATUS_LABEL, STATUS_ORDER } from '@/lib/stock-request/constants';
import { apiFetch, errorMessage, formatDateTime, todayBangkok } from '@/lib/stock-request/client';
import type { BillDetail, BillStatus, BillSummary, Branch } from '@/lib/stock-request/types';

interface Filters {
  q: string;
  branch: string;
  status: string;
  from: string;
  to: string;
}

const EMPTY: Filters = { q: '', branch: '', status: '', from: '', to: '' };

function toQuery(filters: Filters, page?: number) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => value && params.set(key, value));
  if (page && page > 1) params.set('page', String(page));
  return params.toString();
}

// หน้าจัดการทุกสาขา — ค้นหา/กรองตามสาขา สถานะ วันที่ เรียงตามวันที่สร้างบิล
export default function HqBillsPage() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters | null>(null);
  const [page, setPage] = useState(1);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [data, setData] = useState<{ bills: BillSummary[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const initial = { ...EMPTY, status: params.get('status') ?? '', branch: params.get('branch') ?? '' };
    const timer = setTimeout(() => {
      setFilters(initial);
      setApplied(initial);
    }, 0);
    apiFetch<{ branches: Branch[] }>('/api/stock-request/branches')
      .then((result) => setBranches(result.branches))
      .catch(() => undefined);
    return () => clearTimeout(timer);
  }, []);

  const load = useCallback(async () => {
    if (!applied) return;
    setLoading(true);
    try {
      setData(await apiFetch(`/admin/stock-request/api/bills?${toQuery(applied, page)}&hideDone=1`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [applied, page]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const apply = (next: Filters) => {
    setPage(1);
    setApplied(next);
    window.history.replaceState(null, '', `?${toQuery(next)}`);
  };

  const runExport = async (kind: 'excel' | 'pdf') => {
    if (!applied) return;
    setExporting(kind);
    setExportError(null);
    try {
      const result = await apiFetch<{ bills: BillDetail[]; truncated: boolean }>(`/admin/stock-request/api/export?${toQuery(applied)}`);
      if (result.bills.length === 0) throw new Error('ไม่มีข้อมูลตามตัวกรองนี้');
      const name = `stock-request-${todayBangkok()}`;
      if (kind === 'excel') {
        const { exportBillsExcel } = await import('@/lib/stock-request/export-excel');
        await exportBillsExcel(result.bills, name);
      } else {
        const { exportBillsPdf } = await import('@/components/stock-request/BillPdf');
        await exportBillsPdf(result.bills, name);
      }
      if (result.truncated) setExportError('ส่งออกได้สูงสุด 300 บิลต่อครั้ง กรุณากรองช่วงวันที่ให้แคบลงเพื่อดูส่วนที่เหลือ');
    } catch (err) {
      setExportError(errorMessage(err));
    } finally {
      setExporting(null);
    }
  };

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;
  // บิลรอตัดที่ยังไม่มีรายการ = บิลที่ระบบเปิดรอไว้ ไม่ต้องทำอะไร จึงไม่แสดงในตาราง
  const rows = data?.bills.filter((bill) => !(bill.status === 'pending' && bill.item_count === 0)) ?? [];
  const hiddenEmpty = (data?.bills.length ?? 0) - rows.length;
  // จัดกลุ่มตามสาขา เรียงลำดับเดียวกับระบบเบิกสินค้า (ลำดับจาก /api/stock-request/branches) · ในแต่ละกลุ่มเรียงบิลใหม่ → เก่า
  const branchOrder = new Map(branches.map((branch, index) => [branch.name, index]));
  const groups = [...rows.reduce((map, bill) => map.set(bill.branch_name, [...(map.get(bill.branch_name) ?? []), bill]), new Map<string, BillSummary[]>())].sort(
    ([a], [b]) => (branchOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (branchOrder.get(b) ?? Number.MAX_SAFE_INTEGER),
  );

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-black">บิลทุกสาขา</h1>
          <p className="text-sm text-slate-500">
            บิลที่ยังไม่จบ เรียงใหม่ → เก่า · บิลที่ได้รับสินค้าแล้วและไม่มีปัญหาค้าง ดูได้ที่{' '}
            <Link href="/admin/stock-request/branches" className="font-bold text-pink-600 hover:underline">
              🗂️ ประวัติบิล
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <button type="button" className={secondaryButton} disabled={exporting !== null} onClick={() => runExport('excel')}>
            {exporting === 'excel' ? <Spinner className="h-4 w-4" /> : '📗'} Excel
          </button>
          <button type="button" className={secondaryButton} disabled={exporting !== null} onClick={() => runExport('pdf')}>
            {exporting === 'pdf' ? <Spinner className="h-4 w-4" /> : '📕'} PDF
          </button>
        </div>
      </div>

      <CutAllPanel onDone={load} />

      <form
        onSubmit={(event) => {
          event.preventDefault();
          apply(filters);
        }}
        className="grid gap-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-6"
      >
        <input value={filters.q} onChange={(event) => setFilters({ ...filters, q: event.target.value })} placeholder="🔍 ค้นหาชื่อสาขา" className={`${inputClass} lg:col-span-2`} aria-label="ค้นหาชื่อสาขา" />
        <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })} className={inputClass} aria-label="สาขา">
          <option value="">ทุกสาขา</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <select value={filters.status} onChange={(event) => setFilters({ ...filters, status: event.target.value })} className={inputClass} aria-label="สถานะ">
          <option value="">ทุกสถานะ</option>
          {STATUS_ORDER.map((status) => (
            <option key={status} value={status}>
              {status === 'received' ? 'ได้รับแล้ว (มีปัญหาค้าง)' : STATUS_LABEL[status]}
            </option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="ตั้งแต่วันที่" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="ถึงวันที่" />
        <div className="flex gap-2 sm:col-span-2 lg:col-span-6 lg:justify-end">
          <button type="button" className={secondaryButton} onClick={() => { setFilters(EMPTY); apply(EMPTY); }}>
            ล้างตัวกรอง
          </button>
          <button type="submit" className="rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-black text-white hover:bg-pink-600">
            ค้นหา
          </button>
        </div>
      </form>

      <InlineError message={exportError} />

      {error && !data ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingState />
      ) : rows.length === 0 ? (
        <EmptyState icon="🔎" title="ไม่พบบิลตามตัวกรอง" description="บิลที่จบแล้วอยู่ที่หน้า ประวัติบิล" />
      ) : (
        <div className={`overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm ${loading ? 'opacity-60' : ''}`}>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-4 py-3">เลขที่บิล</th>
                  <th className="px-4 py-3">สถานะ</th>
                  <th className="px-4 py-3 text-center">รายการ</th>
                  <th className="px-4 py-3">สร้างเมื่อ</th>
                  <th className="px-4 py-3">ตัดบิล</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              {groups.map(([branchName, bills]) => (
                <tbody key={branchName} className="divide-y divide-slate-100 border-t-4 border-pink-50">
                  <tr className="bg-pink-50/70">
                    <td colSpan={6} className="px-4 py-2">
                      <span className="text-sm font-black text-pink-700">🏪 {branchName}</span>
                      <span className="ml-2 text-xs font-bold text-slate-400">{bills.length} บิล</span>
                    </td>
                  </tr>
                  {bills.map((bill) => (
                    <tr key={bill.id} className="hover:bg-pink-50/40">
                      <td className="px-4 py-3 pl-8 font-mono font-bold">{bill.bill_no}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1">
                          <StatusBadge status={bill.status as BillStatus} />
                          <IssueBadge bill={bill} />
                        </div>
                      </td>
                      <td className="px-4 py-3 text-center font-bold">{bill.item_count}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{formatDateTime(bill.created_at)}</td>
                      <td className="px-4 py-3 text-xs text-slate-500">{bill.billed_at ? `${formatDateTime(bill.billed_at)} · ${bill.billed_by_name ?? ''}` : '-'}</td>
                      <td className="px-4 py-3 text-right">
                        <Link href={`/admin/stock-request/bills/${bill.id}`} className="rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-bold text-pink-700 hover:bg-pink-100">
                          เปิดบิล →
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              ))}
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              ทั้งหมด {data.total - hiddenEmpty} บิล{hiddenEmpty ? ` (ไม่นับบิลว่างที่รอรายการ ${hiddenEmpty} ใบ)` : ''} · หน้า {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-200 disabled:opacity-40">
                ← ก่อนหน้า
              </button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className="rounded-lg px-3 py-1.5 font-bold ring-1 ring-slate-200 disabled:opacity-40">
                ถัดไป →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
