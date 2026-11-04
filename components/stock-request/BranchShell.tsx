'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { apiFetch, errorMessage } from '@/lib/stock-request/client';
import type { Branch } from '@/lib/stock-request/types';
import NotificationBell from './NotificationBell';
import SystemSwitcher from '@/components/SystemSwitcher';
import { ErrorState, LoadingState } from './ui';

interface BranchContextValue {
  branch: Branch;
}

const BranchCtx = createContext<BranchContextValue | null>(null);

export function useBranch() {
  const value = useContext(BranchCtx);
  if (!value) throw new Error('useBranch must be used inside BranchShell');
  return value;
}

const tabs = [
  { href: '/stock-request/bill', label: 'บิลปัจจุบัน', icon: '🧾' },
  { href: '/stock-request/history', label: 'ติดตามสถานะ', icon: '🚚' },
];

/** โครงหน้าฝั่งสาขา: ตรวจว่าเลือกสาขาแล้ว แสดงหัวหน้า เมนู และกระดิ่งแจ้งเตือน (ชื่อพนักงานกรอกตอนลงรายการ) */
export default function BranchShell({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [context, setContext] = useState<BranchContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [awaitingReceipt, setAwaitingReceipt] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const data = await apiFetch<{ branch: Branch | null; awaitingReceipt: number }>('/api/stock-request/branch/context');
      if (!data.branch) {
        router.replace('/stock-request');
        return;
      }
      setContext({ branch: data.branch });
      setAwaitingReceipt(data.awaitingReceipt);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [router]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  return (
    <div className="min-h-screen bg-[#fdf4f7] pb-16 text-slate-800">
      {/* หัวหน้าแบบเดียวกับระบบเบิกสินค้า */}
      <header className="sticky top-0 z-30 px-3 pt-3 sm:px-4">
        <div className="relative mx-auto max-w-3xl rounded-2xl border border-pink-100/80 bg-white/95 shadow-sm shadow-pink-100/60 backdrop-blur">
          <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl bg-linear-to-r from-pink-400 via-rose-400 to-pink-500" />
          {/* 1) สลับระบบ — เมนูหลัก */}
          <div className="px-3 pt-4">
            <SystemSwitcher current="stock-request" area="staff" branchName={context?.branch.name} variant="hero" />
          </div>
          {/* 2) สาขา + แจ้งเตือน */}
          <div className="flex items-center justify-between gap-3 px-4 pt-3">
            <div className="flex min-w-0 items-center gap-3">
              <Link href="/" className="relative h-10 w-10 shrink-0 overflow-hidden rounded-xl border border-pink-100 bg-pink-50 shadow-inner" aria-label="หน้าหลัก">
                <Image src="/logo.png" alt="Aemori" fill sizes="40px" className="object-cover" />
              </Link>
              <div className="min-w-0">
                <p className="truncate text-base font-black leading-tight text-slate-800">🏪 {context?.branch.name ?? '...'}</p>
                {context && (
                  <Link href="/stock-request?change=1" className="text-xs font-bold text-pink-500 hover:underline">
                    เปลี่ยนสาขา
                  </Link>
                )}
              </div>
            </div>
            {context && <NotificationBell endpoint="/api/stock-request/branch/notifications" mode="list" onOpenBill={() => router.push('/stock-request/history')} />}
          </div>
          {/* 3) แท็บของหน้า — เมนูรอง (เส้นใต้) */}
          <nav className="mt-2 grid grid-cols-2 border-t border-pink-50 px-2">
            {tabs.map((tab) => {
              const active = pathname === tab.href;
              return (
                <Link
                  key={tab.href}
                  href={tab.href}
                  aria-current={active ? 'page' : undefined}
                  className={`relative flex items-center justify-center gap-1.5 py-3 text-sm font-bold transition ${active ? 'text-pink-600' : 'text-slate-500 hover:text-pink-600'}`}
                >
                  <span>{tab.icon}</span>
                  {tab.label}
                  {tab.href === '/stock-request/history' && awaitingReceipt > 0 && (
                    <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1.5 text-[10px] font-black text-white" title="บิลที่จัดส่งแล้ว รอยืนยันรับสินค้า">
                      {awaitingReceipt}
                    </span>
                  )}
                  {active && <span className="absolute inset-x-6 bottom-0 h-[3px] rounded-full bg-linear-to-r from-pink-500 to-rose-400" />}
                </Link>
              );
            })}
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-3xl px-4 py-5">
        {error ? <ErrorState message={error} onRetry={load} /> : context ? <BranchCtx.Provider value={context}>{children}</BranchCtx.Provider> : <LoadingState />}
      </main>
    </div>
  );
}
