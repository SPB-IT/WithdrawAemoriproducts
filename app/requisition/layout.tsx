import type { ReactNode } from 'react';
import SystemClosedNotice from '@/components/SystemClosedNotice';
import { closedForStaff } from '@/lib/system-gate';

export const dynamic = 'force-dynamic';

export default async function RequisitionLayout({ children }: { children: ReactNode }) {
  const closed = await closedForStaff('requisition');
  if (closed) return <SystemClosedNotice title="ระบบเบิกสินค้า Aemori" message={closed.message} />;
  return <>{children}</>;
}
