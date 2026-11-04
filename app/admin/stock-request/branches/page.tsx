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
// แบบ master–detail: ซ้าย = รายชื่อสาขา (สีประจำสาขา) · ขวา = บิลเรียงตามวันที่ได้รับ (มือถือ: สาขาเป็นชิปเลื่อนแนวนอน)
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
  // บิลของสาขาที่เลือก (หรือทุกสาขา) เรียงตามวันที่ได้รับ ใหม่ → เก่า แล้วแบ่งกลุ่มตามวัน
  const days = useMemo(() => {
    const rows = branchList
      .filter((group) => !branchFilter || String(group.branch_id) === branchFilter)
      .flatMap((group) => group.bills.map((bill, index) => ({ bill, group, index })))
      .sort((a, b) => (b.bill.received_at ?? '').localeCompare(a.bill.received_at ?? ''));
    const map = new Map<string, typeof rows>();
    for (const row of rows) map.set(dayLabel(row.bill.received_at), [...(map.get(dayLabel(row.bill.received_at)) ?? []), row]);
    return [...map];
  }, [branchList, branchFilter]);

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
              <BranchButton active={!branchFilter} onClick={() => setBranchFilter('')} color="bg-slate-700" initials="ทั้ง" name="ทุกสาขา" sub={`${totalBills} บิล · ${groups.length} สาขา`} />
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

        {/* บิลที่จบแล้ว เรียงตามวันที่ได้รับ */}
        <div className="min-w-0 space-y-4">
          {days.length === 0 ? (
            <EmptyState icon="🗂️" title="ยังไม่มีบิลที่จบแล้ว" description="บิลที่สาขากดยืนยันได้รับสินค้าแล้ว (และไม่มีปัญหาค้าง) จะมาแสดงที่นี่" />
          ) : (
            days.map(([day, rows]) => (
              <div key={day}>
                <p className="mb-2 px-1 text-xs font-black text-slate-400">
                  {day} · {rows.length} บิล
                </p>
                <ul className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
                  {rows.map(({ bill, group, index }) => (
                    <HistoryRow key={bill.id} bill={bill} branchName={group.branch_name} color={branchColor(group.branch_id)} order={index} />
                  ))}
                </ul>
              </div>
            ))
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
const weekdayFormat = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', weekday: 'long' });
const timeFormat = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', hour: '2-digit', minute: '2-digit' });

function dayLabel(iso: string | null) {
  if (!iso) return 'ไม่ทราบวันที่';
  const date = new Date(iso);
  const label = dayFormat.format(date);
  if (label === dayFormat.format(new Date())) return `วันนี้ · ${label}`;
  if (label === dayFormat.format(new Date(Date.now() - 86_400_000))) return `เมื่อวาน · ${label}`;
  return `${weekdayFormat.format(date)} · ${label}`;
}

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

// แถวบิล: แถบสีประจำสาขาด้านซ้าย · ชื่อสาขา + ลำดับบิลของสาขา + สถานะ · เลขบิล/เวลารับ · ชื่อสินค้า
function HistoryRow({ bill, branchName, color, order }: { bill: BillDetail; branchName: string; color: string; order: number }) {
  const hadIssue = bill.issue_status === 'resolved';
  const names = bill.items.map((item) => item.substitution?.product_name ?? item.product_name);
  return (
    <li className="border-b border-slate-100 last:border-b-0">
      <Link href={`/admin/stock-request/bills/${bill.id}`} className="flex items-stretch gap-3 transition hover:bg-pink-50/40">
        <span className={`w-1.5 shrink-0 ${color}`} aria-hidden />
        <div className="min-w-0 flex-1 py-3">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-sm font-black text-slate-800">{branchName}</span>
            <span className="rounded-md bg-slate-100 px-1.5 py-0.5 text-[10px] font-bold text-slate-500">บิล{ORDER_LABEL[order] ?? ''}</span>
            <span className={`ml-auto rounded-full px-2.5 py-0.5 text-[11px] font-black ring-1 ${hadIssue ? 'bg-amber-50 text-amber-700 ring-amber-200' : 'bg-emerald-50 text-emerald-700 ring-emerald-200'}`}>
              {hadIssue ? '🛠️ แก้ไขปัญหาแล้ว' : '✅ ได้รับครบ'}
            </span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            <span className="font-mono font-bold text-slate-600">{bill.bill_no}</span> · รับ {bill.received_at ? timeFormat.format(new Date(bill.received_at)) : '-'} น.
            {bill.received_by_name ? ` โดย ${bill.received_by_name}` : ''}
            {bill.responsible_name ? ` · ผู้รับผิดชอบ ${bill.responsible_name}` : ''}
          </p>
          <p className="mt-1 truncate text-xs">
            <span className="font-bold text-pink-600">📦 {names.length} รายการ</span>
            {names.length > 0 && (
              <span className="text-slate-500">
                {' '}
                · {names.slice(0, 4).join(', ')}
                {names.length > 4 ? ` +${names.length - 4}` : ''}
              </span>
            )}
          </p>
          {hadIssue && bill.issue_resolved_note && <p className="mt-1 truncate text-[11px] text-amber-700">🛠️ {bill.issue_resolved_note}</p>}
        </div>
        <span className="flex items-center pr-3 text-lg text-slate-300" aria-hidden>
          ›
        </span>
      </Link>
    </li>
  );
}
