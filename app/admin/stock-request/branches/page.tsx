'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { EmptyState, ErrorState, LoadingState } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import type { BillDetail } from '@/lib/stock-request/types';

interface IssueRow {
  id: string;
  bill_no: string;
  branch_id: number;
  branch_name: string;
  issue_summary: string | null;
  issue_opened_at: string | null;
  responsible_name: string | null;
}

interface DoneGroup {
  branch_id: number;
  branch_name: string;
  archived: boolean;
  bills: BillDetail[];
}

// ประวัติบิล: บิลที่มีปัญหาค้าง (ทุกสาขา) + บิลที่จบแล้ว (สาขาละ 1–3 บิล)
// ซ้าย = รายชื่อสาขา (สีประจำสาขา) · ขวา = ตารางบิลจัดกลุ่มตามสาขา แบบเดียวกับหน้าบิลทุกสาขา (มือถือ: สาขาเป็นชิปเลื่อนแนวนอน)
export default function BranchesOverviewPage() {
  const [issues, setIssues] = useState<IssueRow[] | null>(null);
  const [groups, setGroups] = useState<DoneGroup[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [branchFilter, setBranchFilter] = useState('');
  const [query, setQuery] = useState('');

  const load = useCallback(async () => {
    try {
      const [overview, done] = await Promise.all([
        apiFetch<{ issues: IssueRow[] }>('/admin/stock-request/api/branches-overview'),
        apiFetch<{ groups: DoneGroup[] }>('/admin/stock-request/api/branches-overview?done=1'),
      ]);
      setIssues(overview.issues);
      setGroups(done.groups);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const branchList = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (groups ?? []).filter((group) => !q || group.branch_name.toLowerCase().includes(q) || group.bills.some((bill) => bill.bill_no.toLowerCase().includes(q)));
  }, [groups, query]);
  const shownGroups = branchList.filter((group) => !branchFilter || String(group.branch_id) === branchFilter);

  if (error && !issues) return <ErrorState message={error} onRetry={load} />;
  if (!issues || !groups) return <LoadingState />;
  const totalBills = groups.reduce((sum, group) => sum + group.bills.length, 0);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-black">🗂️ ประวัติบิล</h1>
        <p className="text-sm text-slate-500">บิลที่มีปัญหาค้าง และบิลที่จบแล้ว (ได้รับสินค้าครบ/แก้ไขปัญหาแล้ว) สาขาละไม่เกิน 3 บิลล่าสุด</p>
      </div>

      {issues.length > 0 && (
        <section className="rounded-2xl border border-rose-100 bg-white p-4 shadow-sm">
          <h2 className="mb-3 text-base font-black text-rose-700">⚠️ บิลที่มีปัญหา รอแก้ไข ({issues.length})</h2>
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
                  <p className="mt-1 text-xs font-bold text-rose-600">เปิดบิลเพื่อแก้ไขปัญหา →</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="grid gap-4 lg:grid-cols-[280px_1fr]">
        {/* รายชื่อสาขา */}
        <aside className="rounded-2xl border border-pink-100 bg-white p-3 shadow-sm lg:sticky lg:top-4 lg:max-h-[calc(100vh-2rem)] lg:self-start lg:overflow-y-auto">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            className="w-full rounded-xl border border-pink-100 bg-pink-50/40 px-3 py-2 text-sm outline-none focus:border-pink-300 focus:bg-white"
            placeholder="🔍 ค้นหาสาขา / เลขที่บิล"
            aria-label="ค้นหา"
          />
          <ul className="-mx-1 mt-2 flex gap-1.5 overflow-x-auto px-1 pb-1 lg:mx-0 lg:block lg:space-y-1 lg:overflow-visible lg:px-0">
            <li className="shrink-0">
              <BranchButton active={!branchFilter} onClick={() => setBranchFilter('')} color="bg-slate-700" initials="🗂️" name="ทุกสาขา" sub={`${totalBills} บิล · ${groups.length} สาขา`} />
            </li>
            {branchList.map((group) => (
              <li key={group.branch_id} className="shrink-0">
                <BranchButton
                  active={branchFilter === String(group.branch_id)}
                  onClick={() => setBranchFilter(String(group.branch_id))}
                  color={branchColor(group.branch_id)}
                  initials={branchInitials(group.branch_name)}
                  name={group.branch_name}
                  sub={`${group.bills.length} บิล · ล่าสุด ${shortDate(group.bills[0]?.received_at)}${group.archived ? ' · ซ่อนแล้ว' : ''}`}
                />
              </li>
            ))}
          </ul>
        </aside>

        {/* บิลที่จบแล้ว จัดกลุ่มตามสาขา */}
        <div className="min-w-0">
          {shownGroups.length === 0 ? (
            <EmptyState icon="🗂️" title="ยังไม่มีบิลที่จบแล้ว" description="บิลที่สาขากดยืนยันได้รับสินค้าแล้ว (และไม่มีปัญหาค้าง) จะมาแสดงที่นี่" />
          ) : (
            <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-sm">
                  <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
                    <tr>
                      <th className="px-4 py-3">บิล</th>
                      <th className="px-4 py-3">เลขที่บิล</th>
                      <th className="px-4 py-3">ได้รับเมื่อ</th>
                      <th className="px-4 py-3 text-center">รายการ</th>
                      <th className="px-4 py-3">สถานะ</th>
                      <th className="px-4 py-3" />
                    </tr>
                  </thead>
                  {shownGroups.map((group) => (
                    <tbody key={group.branch_id} className="divide-y divide-slate-100 border-t-4 border-pink-50">
                      <tr className="bg-pink-50/70">
                        <td colSpan={6} className="px-4 py-2">
                          <div className="flex items-center justify-between gap-2">
                            <span className="flex items-center gap-2 text-sm font-black text-slate-800">
                              <span className={`h-3 w-3 rounded-full ${branchColor(group.branch_id)}`} aria-hidden />
                              {group.branch_name}
                              <span className="text-xs font-bold text-slate-400">{group.bills.length} บิล</span>
                              {group.archived && <span className="rounded-full bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">ซ่อนแล้ว</span>}
                            </span>
                            {!group.archived && (
                              <Link href={`/admin/stock-request/branches/${group.branch_id}`} className="text-xs font-bold text-pink-600 hover:underline">
                                ดูสาขา →
                              </Link>
                            )}
                          </div>
                        </td>
                      </tr>
                      {group.bills.map((bill, index) => (
                        <HistoryRow key={bill.id} bill={bill} order={index} />
                      ))}
                    </tbody>
                  ))}
                </table>
              </div>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}

const BRANCH_COLORS = ['bg-pink-500', 'bg-violet-500', 'bg-sky-500', 'bg-emerald-500', 'bg-amber-500', 'bg-rose-500', 'bg-indigo-500', 'bg-teal-500', 'bg-fuchsia-500', 'bg-orange-500'];
const branchColor = (branchId: number) => BRANCH_COLORS[branchId % BRANCH_COLORS.length];

// อักษรย่อสาขา: ตัดคำว่า "สาขา" นำหน้าออก แล้วใช้ 2 ตัวแรก (ขึ้นต้นด้วยสระหน้า เ แ โ ใ ไ ใช้ 3 ตัว)
function branchInitials(name: string) {
  const base = name.replace(/^สาขา/, '').trim() || name;
  const chars = Array.from(new Intl.Segmenter('th', { granularity: 'grapheme' }).segment(base), (part) => part.segment);
  return chars.slice(0, /^[เแโใไ]/.test(base) ? 3 : 2).join('');
}

const dayFormat = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'short', year: '2-digit' });
const shortDate = (iso: string | null | undefined) => (iso ? dayFormat.format(new Date(iso)) : '-');

function BranchButton({ active, onClick, color, initials, name, sub }: { active: boolean; onClick: () => void; color: string; initials: string; name: string; sub: string }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex w-full items-center gap-2.5 rounded-xl px-2.5 py-2 text-left transition ${active ? 'bg-pink-50 ring-1 ring-pink-200' : 'hover:bg-slate-50'}`}
    >
      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-[11px] font-black text-white shadow-sm ${color}`}>{initials}</span>
      <span className="min-w-0">
        <span className={`block truncate text-sm font-black ${active ? 'text-pink-700' : 'text-slate-700'}`}>{name}</span>
        <span className="block truncate text-[11px] text-slate-400">{sub}</span>
      </span>
    </button>
  );
}

const ORDER_LABEL = ['ล่าสุด', 'ก่อนหน้า', 'เก่าสุด'];

// แถวบิลในตาราง: ลำดับบิลของสาขา · เลขบิล · วันที่/ผู้รับ · จำนวนรายการ (ชี้ดูชื่อสินค้า) · สถานะ
function HistoryRow({ bill, order }: { bill: BillDetail; order: number }) {
  const hadIssue = bill.issue_status === 'resolved';
  const names = bill.items.map((item) => item.substitution?.product_name ?? item.product_name);
  return (
    <tr className="whitespace-nowrap hover:bg-pink-50/40">
      <td className="px-4 py-3">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${order === 0 ? 'bg-pink-500 text-white' : 'bg-pink-50 text-pink-700'}`}>{ORDER_LABEL[order] ?? order + 1}</span>
      </td>
      <td className="px-4 py-3 font-mono font-bold">{bill.bill_no}</td>
      <td className="px-4 py-3 text-xs text-slate-500">
        {formatDateTime(bill.received_at)}
        {bill.received_by_name ? ` · ${bill.received_by_name}` : ''}
      </td>
      <td className="px-4 py-3 text-center font-bold" title={names.join(', ')}>
        {names.length}
      </td>
      <td className="px-4 py-3">
        <span
          title={hadIssue ? bill.issue_resolved_note ?? undefined : undefined}
          className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ${hadIssue ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}
        >
          {hadIssue ? '🛠️ แก้ไขปัญหาแล้ว' : '✅ ได้รับครบ'}
        </span>
      </td>
      <td className="px-4 py-3 text-right">
        <Link href={`/admin/stock-request/bills/${bill.id}`} className="rounded-lg bg-pink-50 px-3 py-1.5 text-xs font-bold text-pink-700 hover:bg-pink-100">
          เปิดบิล →
        </Link>
      </td>
    </tr>
  );
}
