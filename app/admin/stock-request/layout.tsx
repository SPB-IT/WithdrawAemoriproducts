import type { Metadata } from 'next';
import type { ReactNode } from 'react';
import HqShell from '@/components/stock-request/HqShell';

export const metadata: Metadata = {
  title: 'สำนักงานใหญ่ · ระบบแจ้งสินค้าใกล้หมด',
};

export default function HqLayout({ children }: { children: ReactNode }) {
  return <HqShell>{children}</HqShell>;
}
