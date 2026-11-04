'use client';

import Link from 'next/link';

type SystemKey = 'requisition' | 'stock-request';

// คีย์เดียวกับที่หน้าเบิกสินค้าใช้จำสาขา (app/requisition/page.tsx)
const REQUISITION_BRANCH_KEY = 'aemori-requisition-branch';

/**
 * ปุ่มสลับระหว่าง 2 ระบบ (ระบบเบิกสินค้า ⇄ ระบบแจ้งสินค้าใกล้หมด)
 * - area "staff": สลับฝั่งพนักงาน โดยพาสาขาที่เลือกอยู่ไปด้วย ไม่ต้องเลือกสาขาใหม่
 * - area "admin": สลับไปหลังบ้านของอีกระบบโดยตรง
 */
export default function SystemSwitcher({
  current,
  area,
  branchName,
  variant = 'compact',
}: {
  current: SystemKey;
  area: 'staff' | 'admin';
  branchName?: string | null;
  /** compact = ปุ่มเล็กในแถบเมนู · hero = แถบเต็มความกว้าง ระบบที่ใช้อยู่เป็นสีไล่ชมพู (หัวหน้าฝั่งพนักงาน) */
  variant?: 'compact' | 'hero';
}) {
  const href: Record<SystemKey, string> =
    area === 'admin'
      ? { requisition: '/admin/dashboard', 'stock-request': '/admin/stock-request' }
      : { requisition: '/requisition', 'stock-request': branchName ? `/stock-request?branch=${encodeURIComponent(branchName)}` : '/stock-request' };

  // ไปหน้าเบิกสินค้า: ตั้งสาขาเดียวกันไว้ล่วงหน้า (หน้าเบิกอ่านสาขาจาก localStorage)
  const rememberBranch = () => {
    if (!branchName) return;
    try {
      window.localStorage.setItem(REQUISITION_BRANCH_KEY, branchName);
    } catch {
      // localStorage ใช้ไม่ได้ — หน้าเบิกจะให้เลือกสาขาเอง
    }
  };

  const items: { key: SystemKey; icon: string; label: string; short: string }[] = [
    { key: 'requisition', icon: '📝', label: 'เบิกสินค้า', short: 'เบิกสินค้า' },
    { key: 'stock-request', icon: '📸', label: 'แจ้งสินค้าใกล้หมด', short: 'แจ้งของใกล้หมด' },
  ];

  if (variant === 'hero') {
    return (
      <nav aria-label="สลับระบบ" className="grid w-full grid-cols-2 gap-1 rounded-2xl bg-slate-100/80 p-1">
        {items.map((item) =>
          item.key === current ? (
            <span key={item.key} aria-current="page" className="flex items-center justify-center gap-1.5 rounded-xl bg-linear-to-r from-pink-500 to-rose-400 px-2 py-2.5 text-sm font-black text-white shadow-md shadow-pink-200">
              <span className="text-base">{item.icon}</span>
              <span className="whitespace-nowrap">
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </span>
          ) : (
            <Link
              key={item.key}
              href={href[item.key]}
              onClick={item.key === 'requisition' && area === 'staff' ? rememberBranch : undefined}
              className="flex items-center justify-center gap-1.5 rounded-xl px-2 py-2.5 text-sm font-bold text-slate-500 transition hover:bg-white hover:text-pink-600"
            >
              <span className="text-base opacity-70">{item.icon}</span>
              <span className="whitespace-nowrap">
                <span className="sm:hidden">{item.short}</span>
                <span className="hidden sm:inline">{item.label}</span>
              </span>
            </Link>
          ),
        )}
      </nav>
    );
  }

  return (
    <nav aria-label="สลับระบบ" className="inline-flex rounded-xl border border-pink-100 bg-pink-50 p-1 text-xs font-bold">
      {items.map((item) =>
        item.key === current ? (
          <span key={item.key} aria-current="page" className="rounded-lg bg-white px-3 py-1.5 text-pink-600 shadow-sm shadow-pink-100">
            {item.icon} {item.label}
          </span>
        ) : (
          <Link
            key={item.key}
            href={href[item.key]}
            onClick={item.key === 'requisition' && area === 'staff' ? rememberBranch : undefined}
            className="rounded-lg px-3 py-1.5 text-slate-500 transition hover:bg-white/70 hover:text-pink-600"
          >
            {item.icon} {item.label}
          </Link>
        ),
      )}
    </nav>
  );
}
