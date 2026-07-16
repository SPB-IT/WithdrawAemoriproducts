'use client';

import Image from 'next/image';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const links = [
  { href: '/admin/dashboard', label: 'แดชบอร์ด', icon: '📊' },
  { href: '/admin/requisitions', label: 'ใบเบิก', icon: '📝' },
  { href: '/admin/reports', label: 'รายงาน', icon: '📈' },
  { href: '/admin/inventory', label: 'คลัง', icon: '📦' },
];

export default function AdminNav() {
  const pathname = usePathname();
  return (
    <nav className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm shadow-pink-100/50 sm:p-5">
      <div className="flex items-center justify-between gap-4">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="relative h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-pink-200 bg-pink-100 shadow-md shadow-pink-500/10">
            <Image src="/logo.png" alt="Aemori" fill sizes="48px" className="object-cover" priority />
          </div>
          <div className="min-w-0">
            <p className="text-xl font-black leading-tight tracking-tight text-slate-800">Aemori</p>
            <p className="mt-0.5 hidden truncate text-xs font-bold uppercase tracking-widest text-pink-500 sm:block">ระบบจัดการเบิกของ Aemori</p>
          </div>
        </div>
        <div className="hidden items-center gap-1 rounded-xl border border-pink-100/80 bg-pink-50 p-1 text-xs font-bold md:flex">
          {links.map((link) => {
            const active = pathname === link.href;
            return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-4 py-2 transition-all ${active ? 'bg-white text-pink-600 shadow-sm shadow-pink-100' : 'text-slate-600 hover:bg-white/70 hover:text-pink-600'}`}>{link.icon} {link.label}</Link>;
          })}
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-1 rounded-xl border border-pink-100 bg-pink-50 p-1 text-center text-[11px] font-bold md:hidden">
        {links.map((link) => {
          const active = pathname === link.href;
          return <Link key={link.href} href={link.href} aria-current={active ? 'page' : undefined} className={`rounded-lg px-1 py-2 ${active ? 'bg-white text-pink-600 shadow-sm' : 'text-slate-600'}`}><span className="block text-base">{link.icon}</span>{link.label}</Link>;
        })}
      </div>
      <form action="/api/admin/logout" method="post" className="mt-3 flex justify-end">
        <button type="submit" className="rounded-lg px-3 py-1.5 text-[11px] font-bold text-slate-500 transition-colors hover:bg-rose-50 hover:text-rose-600">ออกจากโหมดผู้ดูแล</button>
      </form>
    </nav>
  );
}
