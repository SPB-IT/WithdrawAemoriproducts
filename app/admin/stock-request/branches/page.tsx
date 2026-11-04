'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState, StatusBadge, inputClass } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import type { BillStatus } from '@/lib/stock-request/types';

interface IssueRow {
  id: string;
  bill_no: string;
  branch_id: number;
  branch_name: string;
  issue_summary: string | null;
  issue_opened_at: string | null;
  responsible_name: string | null;
}

interface BranchRow {
  id: number;
  name: string;
  bill_count: number;
  latest: { bill_no: string; status: BillStatus; created_at: string } | null;
  open_issues: number;
}

// รายสาขา: บิลที่มีปัญหาค้าง (ทุกสาขา) + รายชื่อสาขา → กดเพื่อดู 3 บิลล่าสุดของสาขานั้น
export default function BranchesOverviewPage() {
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [branches, setBranches] = useState<BranchRow[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ issues: IssueRow[]; branches: BranchRow[] }>('/admin/stock-request/api/branches-overview');
      setIssues(data.issues);
      setBranches(data.branches);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    // สาขาที่มีปัญหาค้างขึ้นก่อน
    return branches
      .filter((branch) => !q || branch.name.toLowerCase().includes(q))
      .sort((a, b) => b.open_issues - a.open_issues || a.name.localeCompare(b.name, 'th'));
  }, [branches, query]);

  if (error && !issues) return <ErrorState message={error} onRetry={load} />;
  if (!issues) return <LoadingState />;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">🏪 รายสาขา</h1>
        <p className="text-sm text-slate-500">บิลที่มีปัญหาค้างของทุกสาขา และประวัติ 3 บิลล่าสุดแยกตามสาขา</p>
      </div>

      <section className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-black text-rose-700">⚠️ บิลที่มีปัญหา รอแก้ไข ({issues.length})</h2>
        {issues.length === 0 ? (
          <EmptyState icon="✅" title="ไม่มีบิลที่มีปัญหาค้าง" description="เมื่อสาขาแจ้งได้รับของไม่ครบ บิลจะมาแสดงที่นี่จนกว่าจะปิดเรื่อง" />
        ) : (
          <ul className="space-y-2">
            {issues.map((issue) => (
              <li key={issue.id}>
                <Link href={`/admin/stock-request/bills/${issue.id}`} className="block rounded-xl border border-rose-100 bg-rose-50/60 p-3 transition hover:border-rose-300 hover:bg-rose-50">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="font-black text-slate-800">{issue.branch_name}</p>
                      <p className="font-mono text-xs text-slate-500">
                        {issue.bill_no}
                        {issue.responsible_name ? ` · ผู้รับผิดชอบ ${issue.responsible_name}` : ''}
                      </p>
                    </div>
                    <span className="text-[11px] font-bold text-rose-600">แจ้ง {formatDateTime(issue.issue_opened_at)}</span>
                  </div>
                  {issue.issue_summary && <p className="mt-1.5 line-clamp-2 text-xs text-rose-700">{issue.issue_summary}</p>}
                  <p className="mt-1 text-xs font-bold text-rose-600">เปิดบิลเพื่อปิดเรื่อง →</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-black">สาขาทั้งหมด ({branches.length})</h2>
          <input value={query} onChange={(event) => setQuery(event.target.value)} className={`${inputClass} max-w-xs`} placeholder="🔍 ค้นหาชื่อสาขา" aria-label="ค้นหาชื่อสาขา" />
        </div>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((branch) => (
            <li key={branch.id}>
              <Link
                href={`/admin/stock-request/branches/${branch.id}`}
                className={`block h-full rounded-2xl border bg-white p-4 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md ${branch.open_issues ? 'border-rose-200' : 'border-pink-100'}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <p className="font-black text-slate-800">🏪 {branch.name}</p>
                  {branch.open_issues > 0 && <span className="shrink-0 rounded-full bg-rose-500 px-2 py-0.5 text-[11px] font-black text-white">⚠️ {branch.open_issues}</span>}
                </div>
                {branch.latest ? (
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-slate-500">
                    <span className="font-mono">{branch.latest.bill_no}</span>
                    <StatusBadge status={branch.latest.status} />
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-slate-400">ยังไม่มีบิลที่ตัดแล้ว</p>
                )}
                <p className="mt-2 text-xs font-bold text-pink-600">ดูประวัติ {branch.bill_count} บิล →</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
