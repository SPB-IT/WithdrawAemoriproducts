import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'หยิบของ · Aemori',
  description: 'รายการสินค้าที่ต้องหยิบสำหรับบิลนี้',
  robots: { index: false, follow: false },
};

export default function PickLinkLayout({ children }: { children: ReactNode }) {
  return <div lang="th" className="flex min-h-full flex-1 flex-col bg-linear-to-b from-pink-50 to-white">{children}</div>;
}
