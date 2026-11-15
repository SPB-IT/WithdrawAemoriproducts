import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import SystemClosedNotice from '@/components/SystemClosedNotice';
import { closedForStaff } from '@/lib/system-gate';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'ระบบแจ้งสินค้าใกล้หมด · Aemori',
  description: 'สาขาแจ้งรายการสินค้าใกล้หมดพร้อมรูป สำนักงานใหญ่ตรวจ ตัดบิล และจัดส่ง',
};

export default async function StockRequestLayout({ children }: { children: ReactNode }) {
  const closed = await closedForStaff('stock-request');
  if (closed) return <SystemClosedNotice title="ระบบแจ้งสินค้าใกล้หมด" message={closed.message} />;
  return <div lang="th" className="flex min-h-full flex-1 flex-col">{children}</div>;
}
