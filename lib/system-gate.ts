import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-auth';
import { getSystemStatuses, type SystemKey, type SystemState } from '@/lib/system-status';

/** ถ้าระบบปิดอยู่และผู้ใช้ไม่ใช่ผู้ดูแล → คืนสถานะปิด (ใช้ใน layout ฝั่งพนักงาน) · ไม่ปิด → null */
export async function closedForStaff(system: SystemKey): Promise<SystemState | null> {
  const state = (await getSystemStatuses())[system];
  if (!state.closed) return null;
  const store = await cookies();
  if (await verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value, process.env.ADMIN_SESSION_SECRET ?? '')) return null;
  return state;
}
