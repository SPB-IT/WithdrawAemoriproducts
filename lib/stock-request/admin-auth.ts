import 'server-only';
import { cookies } from 'next/headers';
import { ADMIN_COOKIE_NAME, verifyAdminSession } from '@/lib/admin-auth';
import { SR_SHARED_ADMIN_NAME } from './constants';
import { ApiError, fromDbError } from './errors';
import { getServiceClient } from './supabase-admin';
import type { AdminProfile } from './types';

// ใช้การเข้าสู่โหมดผู้ดูแลเดิม (/admin/access รหัสกลาง) เป็นตัวยืนยันสิทธิ์ เหมือนระบบเบิกสินค้าเดิม
// ไม่ต้องเลือกชื่อ — ทุกการกระทำของ HQ บันทึกในนามโปรไฟล์กลาง "ผู้ดูแลระบบ" (admin_profiles)

export async function requireAdminSession() {
  const store = await cookies();
  const valid = await verifyAdminSession(store.get(ADMIN_COOKIE_NAME)?.value, process.env.ADMIN_SESSION_SECRET ?? '');
  if (!valid) throw new ApiError(401, 'SR_UNAUTHENTICATED', 'กรุณาเข้าสู่โหมดผู้ดูแลก่อน');
  return store;
}

const PROFILE_COLUMNS = 'id, display_name, email, role, is_active';
let sharedProfile: AdminProfile | null = null;

/** โปรไฟล์ผู้ดูแลกลาง — ใช้บันทึกการแก้ไขที่มาจากลิงก์หยิบของ (ไม่มี session แอดมิน) */
export async function getSharedAdminProfile(): Promise<AdminProfile> {
  if (sharedProfile) return sharedProfile;
  const db = getServiceClient();
  const find = () => db.from('admin_profiles').select(PROFILE_COLUMNS).eq('display_name', SR_SHARED_ADMIN_NAME).maybeSingle();

  let { data, error } = await find();
  if (error) throw fromDbError(error);
  if (!data) {
    const inserted = await db.from('admin_profiles').insert({ display_name: SR_SHARED_ADMIN_NAME, role: 'super_admin' }).select(PROFILE_COLUMNS).single();
    // 23505 = อีก request สร้างไปพร้อมกัน → อ่านตัวที่มีอยู่
    if (inserted.error?.code === '23505') ({ data, error } = await find());
    else ({ data, error } = inserted);
    if (error) throw fromDbError(error);
  }
  if (!data) throw new ApiError(500, 'SR_DB_ERROR', 'ไม่พบโปรไฟล์ผู้ดูแลระบบ');
  sharedProfile = data as AdminProfile;
  return sharedProfile;
}

export async function requireAdmin(): Promise<AdminProfile> {
  await requireAdminSession();
  return getSharedAdminProfile();
}
