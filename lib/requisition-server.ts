import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-auth';
import { ApiError } from '@/lib/stock-request/errors';

// ระบบเบิกสินค้า (schema public): การเขียนข้อมูลทั้งหมดทำฝั่ง server ด้วย service role
// เบราว์เซอร์ใช้ anon key อ่านอย่างเดียว — ป้องกันการแก้ข้อมูลโดยตรงด้วยคีย์สาธารณะ

let cached: SupabaseClient | null = null;

export function serviceDb() {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new ApiError(503, 'NOT_CONFIGURED', 'ระบบยังไม่ได้ตั้งค่า SUPABASE_SERVICE_ROLE_KEY');
  cached = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

/** API หลังบ้านต้องเข้าโหมดผู้ดูแล (รหัสกลาง) ก่อน — /api/admin/* ไม่ผ่าน proxy จึงตรวจเองทุก route */
export async function requireAdminApi() {
  const store = await cookies();
  const valid = await verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value, process.env.ADMIN_SESSION_SECRET ?? '');
  if (!valid) throw new ApiError(401, 'UNAUTHENTICATED', 'กรุณาเข้าสู่โหมดผู้ดูแลก่อน');
}

/** แปลง error จาก Supabase เป็นข้อความที่แสดงผู้ใช้ได้ (log รายละเอียดไว้ฝั่ง server) */
export function dbError(error: { message?: string; code?: string; details?: string | null } | null, message: string): ApiError {
  console.error('[requisition] database error', { code: error?.code, message: error?.message, details: error?.details });
  if (error?.code === '23503') return new ApiError(409, 'IN_USE', `${message}: ข้อมูลนี้ถูกใช้งานอยู่`);
  if (error?.code === '23505') return new ApiError(409, 'DUPLICATE', `${message}: ข้อมูลซ้ำกับที่มีอยู่แล้ว`);
  return new ApiError(500, 'DB_ERROR', message);
}

export async function changeStock(itemId: string, qty: number, direction: 'increment' | 'decrement') {
  const { error } = await serviceDb().rpc(`${direction}_item_stock`, { p_item_id: itemId, p_qty: qty });
  return error;
}
