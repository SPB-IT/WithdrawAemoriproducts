'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from 'react';
import { SR_HQ_API, SR_HQ_HOME } from '@/lib/stock-request/constants';
import { ClientApiError, apiFetch, errorMessage } from '@/lib/stock-request/client';
import type { AdminProfile } from '@/lib/stock-request/types';
import NotificationBell from './NotificationBell';
import SystemSwitcher from '@/components/SystemSwitcher';
import { ErrorState, LoadingState } from './ui';

const AdminCtx = createContext<AdminProfile | null>(null);

export function useAdmin() {
  const admin = useContext(AdminCtx);
  if (!admin) throw new Error('useAdmin must be used inside HqShell');
  return admin;
}

const links = [
  { href: SR_HQ_HOME, label: 'แดชบอร์ด', icon: '📊' },
  { href: `${SR_HQ_HOME}/bills`, label: 'บิลทุกสาขา', icon: '🧾' },
  { href: `${SR_HQ_HOME}/pick`, label: 'แพ็คของ', icon: '📦' },
  { href: `${SR_HQ_HOME}/branches`, label: 'ประวัติบิล', icon: '🗂️' },
  { href: `${SR_HQ_HOME}/audit`, label: 'ประวัติการแก้ไข', icon: '🕘' },
];

type State = { kind: 'loading' } | { kind: 'ready'; admin: AdminProfile } | { kind: 'error'; message: string };

/**
 * โครงหน้าฝั่งสำนักงานใหญ่ของระบบแจ้งสินค้าใกล้หมด
 * สิทธิ์เข้าใช้ = โหมดผู้ดูแลเดิม (/admin/access) เหมือนระบบเบิกสินค้าเดิม ไม่ต้องเลือกชื่อ
 */
export default function HqShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ admin: AdminProfile }>(`${SR_HQ_API}/me`);
      setState({ kind: 'ready', admin: data.admin });
    } catch (err) {
      if (err instanceof ClientApiError && err.status === 401) {
        window.location.replace(`/admin/access?returnTo=${encodeURIComponent(window.location.pathname)}`);
        return;
      }
      setState({ kind: 'error', message: errorMessage(err) });
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const admin = state.kind === 'ready' ? state.admin : null;
  const body =
    state.kind === 'ready' ? (
      <AdminCtx.Provider value={state.admin}>{children}</AdminCtx.Provider>
    ) : state.kind === 'error' ? (
      <ErrorState message={state.message} onRetry={load} />
    ) : (
      <LoadingState label="กำลังตรวจสอบสิทธิ์..." />
    );

  // หน้าตาเดียวกับหลังบ้านระบบเบิกสินค้า (AdminNav)
  return (
    <div className="min-h-screen bg-linear-to-br from-pink-50 via-white to-rose-50/30 px-3 py-6 text-slate-800 sm:px-6 sm:py-8 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-5">
        <nav className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm shadow-pink-100/50 sm:p-5">
          <div className="flex items-center justify-between gap-4">
            <Link href={SR_HQ_HOME} className="flex min-w-0 items-center gap-3.5">
              <span className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-pink-200 bg-pink-100 shadow-md shadow-pink-500/10">
                <Image src="/logo.png" alt="Aemori" fill sizes="48px" className="object-cover" priority />
              </span>
              <span className="min-w-0">
                <span className="block text-xl font-black leading-tight tracking-tight text-slate-800">Aemori</span>
                <span className="mt-0.5 block truncate text-xs font-bold uppercase tracking-widest text-pink-500">ระบบแจ้งสินค้าใกล้หมด</span>
              </span>
            </Link>
            <div className="flex items-center gap-3">
              <div className="hidden items-center gap-1 rounded-xl border border-pink-100/80 bg-pink-50 p-1 text-xs font-bold md:flex">
                {links.map((link) => {
                  const active = link.href === SR_HQ_HOME ? pathname === link.href : pathname.startsWith(link.href);
                  return (
                    <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-4 py-2 transition-all ${active ? 'bg-white text-pink-600 shadow-sm shadow-pink-100' : 'text-slate-600 hover:bg-white/70 hover:text-pink-600'}`}>
                      {link.icon} {link.label}
                    </Link>
                  );
                })}
              </div>
              {admin && <NotificationBell endpoint={`${SR_HQ_API}/notifications`} mode="list" onOpenBill={(billId) => router.push(`${SR_HQ_HOME}/bills/${billId}`)} />}
            </div>
          </div>
          <div className="mt-4 grid grid-cols-5 gap-1 rounded-xl border border-pink-100 bg-pink-50 p-1 text-center text-[10px] font-bold md:hidden">
            {links.map((link) => {
              const active = link.href === SR_HQ_HOME ? pathname === link.href : pathname.startsWith(link.href);
              return (
                <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-1 py-2 ${active ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-600'}`}>
                  <span className="block text-base">{link.icon}</span>
                  {link.label}
                </Link>
              );
            })}
          </div>
          <form action="/api/admin/logout" method="post" className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <SystemSwitcher current="stock-request" area="admin" />
            <button type="submit" className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600">
              ออกจากโหมดผู้ดูแล
            </button>
          </form>
        </nav>
        <main>{body}</main>
      </div>
    </div>
  );
}
