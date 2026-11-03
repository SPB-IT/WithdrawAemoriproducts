'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';

// หน้าเลือกสาขาของระบบเบิกสินค้า — ไม่ต้องใช้รหัส (เลือกบริบทการใช้งาน) ชื่อผู้เบิกกรอกตอนส่งใบเบิก
export default function BranchPicker({
  branches,
  loading,
  error,
  current,
  onSelect,
  onCancel,
}: {
  branches: { name: string }[];
  loading: boolean;
  error: string;
  current: string;
  onSelect: (name: string) => void;
  onCancel?: () => void;
}) {
  const [query, setQuery] = useState('');
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return branches.filter((branch) => !q || branch.name.toLowerCase().includes(q));
  }, [branches, query]);

  return (
    <main className="min-h-screen bg-linear-to-b from-pink-50 via-white to-rose-50/40 px-4 py-8 text-slate-800">
      <div className="mx-auto max-w-xl">
        {onCancel ? (
          <button type="button" onClick={onCancel} className="text-xs font-bold text-slate-500 hover:text-pink-600">
            ← กลับไปหน้าเบิกสินค้า
          </button>
        ) : (
          <Link href="/" className="text-xs font-bold text-slate-500 hover:text-pink-600">
            ← หน้าหลัก
          </Link>
        )}
        <h1 className="mt-3 text-2xl font-black">เลือกสาขา</h1>
        <p className="mt-1 text-sm text-slate-500">ระบบเบิกสินค้า Aemori — เลือกสาขาที่คุณประจำอยู่</p>

        <div className="relative mt-5">
          <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-400">🔍</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="ค้นหาชื่อสาขา"
            className="block w-full rounded-xl border border-slate-200 bg-white py-2.5 pl-10 pr-3.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-pink-400 focus:ring-4 focus:ring-pink-100"
            autoFocus
            aria-label="ค้นหาชื่อสาขา"
          />
        </div>

        <div className="mt-4">
          {error ? (
            <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-6 text-center text-sm font-bold text-rose-600">⚠️ {error}</div>
          ) : loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm font-bold text-pink-500">
              <span className="inline-block h-4 w-4 animate-spin rounded-full border-2 border-pink-200 border-t-pink-500" />
              กำลังโหลดรายชื่อสาขา...
            </div>
          ) : filtered.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-slate-200 bg-white py-12 text-center">
              <p className="text-3xl">🏪</p>
              <p className="mt-2 text-sm font-bold text-slate-600">ไม่พบสาขาที่ค้นหา</p>
              <p className="text-xs text-slate-400">ลองพิมพ์ชื่อสาขาใหม่อีกครั้ง</p>
            </div>
          ) : (
            <ul className="grid gap-2">
              {filtered.map((branch) => {
                const isCurrent = branch.name === current;
                return (
                  <li key={branch.name}>
                    <button
                      type="button"
                      onClick={() => onSelect(branch.name)}
                      className={`flex w-full items-center justify-between gap-3 rounded-2xl border bg-white px-4 py-3.5 text-left shadow-sm transition hover:border-pink-300 hover:shadow-md ${isCurrent ? 'border-pink-400 ring-2 ring-pink-100' : 'border-slate-100'}`}
                    >
                      <span className="flex items-center gap-3">
                        <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-pink-50 text-lg">🏪</span>
                        <span>
                          <span className="block text-sm font-bold text-slate-800">{branch.name}</span>
                          {isCurrent && <span className="text-xs font-semibold text-pink-600">สาขาที่ใช้งานอยู่</span>}
                        </span>
                      </span>
                      <span className="text-slate-300">›</span>
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
