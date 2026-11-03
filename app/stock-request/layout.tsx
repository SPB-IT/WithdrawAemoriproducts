import type { Metadata } from 'next';
import type { ReactNode } from 'react';

export const metadata: Metadata = {
  title: 'ระบบแจ้งสินค้าใกล้หมด · Aemori',
  description: 'สาขาแจ้งรายการสินค้าใกล้หมดพร้อมรูป สำนักงานใหญ่ตรวจ ตัดบิล และจัดส่ง',
};

export default function StockRequestLayout({ children }: { children: ReactNode }) {
  return <div lang="th" className="flex min-h-full flex-1 flex-col">{children}</div>;
}
