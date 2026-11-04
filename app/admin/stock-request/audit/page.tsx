'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, inputClass, secondaryButton } from '@/components/stock-request/ui';
import { AUDIT_ACTION_LABEL, FIELD_LABEL } from '@/lib/stock-request/constants';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import type { AuditLogRow, Branch, JsonObject } from '@/lib/stock-request/types';

type AuditView = AuditLogRow & { bill_no: string; branch_name: string; item_label: string | null };

function summarize(data: JsonObject | null) {
  if (!data) return '-';
  const entries = Object.entries(data).filter(([key]) => key in FIELD_LABEL || key === 'product_name' || key === 'product_code');
  if (entries.length === 0) return '-';
  return entries.map(([key, value]) => `${FIELD_LABEL[key] ?? key}: ${value ?? '-'}`).join(', ');
}

// รายงานการแก้ไขทุกบิล (Audit Log)
export default function HqAuditPage() {
  const [branches, setBranches] = useState<Branch[]>([]);
  const [filters, setFilters] = useState({ branch: '', from: '', to: '', afterBilling: false });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(1);
  const [data, setData] = useState<{ logs: AuditView[]; total: number; pageSize: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    apiFetch<{ branches: Branch[] }>('/api/stock-request/branches')
      .then((result) => setBranches(result.branches))
      .catch(() => undefined);
  }, []);

  const load = useCallback(async () => {
    const params = new URLSearchParams({ page: String(page) });
    if (applied.branch) params.set('branch', applied.branch);
    if (applied.from) params.set('from', applied.from);
    if (applied.to) params.set('to', applied.to);
    if (applied.afterBilling) params.set('afterBilling', '1');
    try {
      setData(await apiFetch(`/admin/stock-request/api/audit?${params}`));
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [applied, page]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-black">ประวัติการแก้ไข</h1>
        <p className="text-sm text-slate-500">บันทึกทุกการกระทำของผู้ดูแลและพนักงานสาขา (แสดงเป็น “สาขา · ชื่อ”): ใคร ทำอะไร เมื่อไร ข้อมูลก่อน/หลัง และเหตุผล · ส่งออก Excel ได้จากหน้า “บิลทุกสาขา” (ชีต “รายงานการแก้ไข”)</p>
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          setPage(1);
          setApplied(filters);
        }}
        className="grid gap-3 rounded-2xl border border-pink-100 bg-white p-4 shadow-sm sm:grid-cols-2 lg:grid-cols-5"
      >
        <select value={filters.branch} onChange={(event) => setFilters({ ...filters, branch: event.target.value })} className={inputClass} aria-label="สาขา">
          <option value="">ทุกสาขา</option>
          {branches.map((branch) => (
            <option key={branch.id} value={branch.id}>
              {branch.name}
            </option>
          ))}
        </select>
        <input type="date" value={filters.from} onChange={(event) => setFilters({ ...filters, from: event.target.value })} className={inputClass} aria-label="ตั้งแต่วันที่" />
        <input type="date" value={filters.to} onChange={(event) => setFilters({ ...filters, to: event.target.value })} className={inputClass} aria-label="ถึงวันที่" />
        <label className="flex items-center gap-2 text-sm font-semibold text-slate-600">
          <input type="checkbox" checked={filters.afterBilling} onChange={(event) => setFilters({ ...filters, afterBilling: event.target.checked })} className="h-4 w-4 accent-pink-600" />
          เฉพาะแก้หลังตัดบิล
        </label>
        <button type="submit" className="rounded-xl bg-pink-500 px-5 py-2.5 text-sm font-black text-white hover:bg-pink-600">
          ค้นหา
        </button>
      </form>

      {error && !data ? (
        <ErrorState message={error} onRetry={load} />
      ) : !data ? (
        <LoadingState />
      ) : data.logs.length === 0 ? (
        <EmptyState icon="🕘" title="ไม่มีประวัติการแก้ไขตามตัวกรอง" />
      ) : (
        <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] text-sm">
              <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                <tr>
                  <th className="px-3 py-3">วันเวลา</th>
                  <th className="px-3 py-3">บิล / สาขา</th>
                  <th className="px-3 py-3">ผู้แก้ไข</th>
                  <th className="px-3 py-3">ประเภท</th>
                  <th className="px-3 py-3">ก่อน</th>
                  <th className="px-3 py-3">หลัง</th>
                  <th className="px-3 py-3">เหตุผล</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 align-top text-xs">
                {data.logs.map((log) => (
                  <tr key={log.id} className={log.after_billing ? 'bg-amber-50/40' : ''}>
                    <td className="whitespace-nowrap px-3 py-2.5 text-slate-500">{formatDateTime(log.created_at)}</td>
                    <td className="px-3 py-2.5">
                      <Link href={`/admin/stock-request/bills/${log.bill_id}`} className="font-mono font-bold text-pink-700 hover:underline">
                        {log.bill_no}
                      </Link>
                      <p className="text-slate-500">{log.branch_name}</p>
                    </td>
                    <td className="px-3 py-2.5 font-bold">{log.admin_name}</td>
                    <td className="px-3 py-2.5">
                      <p className="font-bold">{AUDIT_ACTION_LABEL[log.action]}</p>
                      {log.item_label && <p className="text-slate-500">{log.item_label}</p>}
                      {log.after_billing && <span className="mt-0.5 inline-block rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">หลังตัดบิล</span>}
                    </td>
                    <td className="px-3 py-2.5 text-slate-500">{summarize(log.before_data)}</td>
                    <td className="px-3 py-2.5 text-slate-700">{summarize(log.after_data)}</td>
                    <td className="px-3 py-2.5">{log.reason ?? '-'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex items-center justify-between border-t border-slate-100 px-4 py-3 text-xs text-slate-500">
            <span>
              ทั้งหมด {data.total} รายการ · หน้า {page}/{totalPages}
            </span>
            <div className="flex gap-2">
              <button type="button" disabled={page <= 1} onClick={() => setPage(page - 1)} className={`${secondaryButton} px-3 py-1.5 text-xs`}>
                ← ก่อนหน้า
              </button>
              <button type="button" disabled={page >= totalPages} onClick={() => setPage(page + 1)} className={`${secondaryButton} px-3 py-1.5 text-xs`}>
                ถัดไป →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
