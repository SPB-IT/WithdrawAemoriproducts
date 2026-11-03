'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/stock-request/client';
import type { Branch } from '@/lib/stock-request/types';
import { EmptyState, ErrorState, LoadingState, Spinner, inputClass } from '@/components/stock-request/ui';

// หน้าเลือกสาขา — ไม่ต้องใช้ PIN (เป็นการเลือกบริบทการใช้งาน ไม่ใช่การยืนยันตัวตน)
export default function SelectBranchPage() {
  const router = useRouter();
  const [branches, setBranches] = useState<Branch[] | null>(null);
  const [current, setCurrent] = useState<{ branch: Branch | null } | null>(null);
  const [query, setQuery] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [selecting, setSelecting] = useState<number | null>(null);

  const load = useCallback(async () => {
    setError(null);
    try {
      const [list, ctx] = await Promise.all([
        apiFetch<{ branches: Branch[] }>('/api/stock-request/branches'),
        apiFetch<{ branch: Branch | null }>('/api/stock-request/branch/context'),
      ]);
      setBranches(list.branches);
      setCurrent(ctx);
      const wantsChange = new URLSearchParams(window.location.search).has('change');
      if (ctx.branch && !wantsChange) router.replace('/stock-request/bill');
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (branches ?? []).filter((branch) => !q || branch.name.toLowerCase().includes(q));
  }, [branches, query]);

  const choose = async (branch: Branch) => {
    setSelecting(branch.id);
    setError(null);
    try {
      await apiFetch('/api/stock-request/branch/context', { method: 'POST', json: { branchId: branch.id } });
      router.push('/stock-request/bill');
    } catch (err) {
      setError(errorMessage(err));
      setSelecting(null);
    }
  };

  return (
    <main className="min-h-screen bg-[#fdf4f7] px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-xl">
        <Link href="/" className="text-xs font-bold text-slate-500 hover:text-pink-600">
          ← หน้าหลัก
        </Link>
        <h1 className="mt-3 text-2xl font-black">เลือกสาขา</h1>
        <p className="mt-1 text-sm text-slate-500">ระบบแจ้งสินค้าใกล้หมด — เลือกสาขาที่คุณประจำอยู่</p>

        <div className="relative mt-5">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อสาขา"
            className={`${inputClass} pl-10`}
            autoFocus
            aria-label="ค้นหาชื่อสาขา"
          />
        </div>

        <div className="mt-4">
          {error ? (
            <ErrorState message={error} onRetry={load} />
          ) : !branches ? (
            <LoadingState label="กำลังโหลดรายชื่อสาขา..." />
          ) : filtered.length === 0 ? (
            <EmptyState icon="🏪" title="ไม่พบสาขาที่ค้นหา" description="ลองพิมพ์ชื่อสาขาใหม่อีกครั้ง" />
          ) : (
            <ul className="grid gap-2">
              {filtered.map((branch) => {
                const isCurrent = current?.branch?.id === branch.id;
                return (
                  <li key={branch.id}>
                    <button
                      type="button"
                      disabled={selecting !== null}
                      onClick={() => choose(branch)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-pink-300 hover:shadow-md disabled:opacity-60 ${isCurrent ? 'border-pink-400 ring-2 ring-pink-100' : 'border-slate-100'}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-lg">🏪</span>
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{branch.name}</span>
                          {isCurrent && <span className="text-xs font-semibold text-pink-600">สาขาที่ใช้งานอยู่</span>}
                        </span>
                      </span>
                      {selecting === branch.id ? <Spinner className="h-5 w-5 text-pink-500" /> : <span className="text-slate-300">›</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </main>
  );
}
