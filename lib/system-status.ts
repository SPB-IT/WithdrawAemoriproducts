// สวิตช์ปิด/เปิดระบบ (ตาราง public.system_status) — อ่าน/เขียนด้วย service role ผ่าน PostgREST
// หลักการ "เปิดไว้ก่อน": อ่านไม่ได้ ตารางยังไม่มี หรือไม่มีแถว = ถือว่าเปิด (ไม่ทำให้ระบบล่มเพราะสวิตช์)
// ไฟล์นี้ใช้ได้ทั้งใน proxy และ server component (ห้าม import จากฝั่ง client)

export type SystemKey = 'requisition' | 'stock-request';
export type SystemState = { closed: boolean; message: string | null };
export type SystemStatusMap = Record<SystemKey, SystemState>;

export const SYSTEM_KEYS: SystemKey[] = ['requisition', 'stock-request'];
export const DEFAULT_CLOSED_MESSAGE = 'ระบบนี้ยังไม่เปิดให้ใช้งาน ขออภัยในความไม่สะดวก';

const openState = (): SystemStatusMap => ({
  requisition: { closed: false, message: null },
  'stock-request': { closed: false, message: null },
});

const TTL_MS = 5_000;
let cache: { at: number; value: SystemStatusMap } | null = null;

function rest(path: string, init?: RequestInit) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return fetch(`${url}/rest/v1/system_status${path}`, {
    ...init,
    cache: 'no-store',
    headers: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
}

export async function getSystemStatuses(): Promise<SystemStatusMap> {
  if (cache && Date.now() - cache.at < TTL_MS) return cache.value;
  const value = openState();
  try {
    const res = await rest('?select=system,closed,message');
    if (res?.ok) {
      const rows = (await res.json()) as { system: string; closed: boolean; message: string | null }[];
      for (const row of rows) {
        if (row.system === 'requisition' || row.system === 'stock-request') value[row.system] = { closed: !!row.closed, message: row.message };
      }
    }
  } catch {
    // อ่านไม่ได้ → เปิดไว้
  }
  cache = { at: Date.now(), value };
  return value;
}

export async function setSystemStatus(system: SystemKey, closed: boolean, message: string | null) {
  const pending = rest('?on_conflict=system', {
    method: 'POST',
    headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
    body: JSON.stringify({ system, closed, message: message?.trim() || null, updated_at: new Date().toISOString() }),
  });
  if (!pending) return { ok: false as const, error: 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY' };
  const res = await pending;
  cache = null;
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    console.error('[system-status] write failed', res.status, text);
    const missing = res.status === 404 || text.includes('system_status');
    return { ok: false as const, error: missing ? 'ยังไม่ได้สร้างตาราง system_status ในฐานข้อมูล (รัน migration ก่อน)' : 'บันทึกไม่สำเร็จ' };
  }
  return { ok: true as const };
}
