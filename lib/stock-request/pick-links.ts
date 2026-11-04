import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { ApiError, fromDbError } from './errors';
import { getServiceClient } from './supabase-admin';

/** ลิงก์หยิบของใช้ได้สูงสุด 24 ชั่วโมง (และหมดทันทีเมื่อบิลถูกจัดส่ง / ถูกยกเลิก) */
export const PICK_LINK_HOURS = 24;

export interface PickLinkRow {
  id: string;
  bill_id: string;
  created_at: string;
  expires_at: string;
  revoked_at: string | null;
  last_saved_at: string | null;
  last_saved_by: string | null;
}

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex');

/** สร้างลิงก์ใหม่ของบิล — ยกเลิกลิงก์เดิมของบิลนี้ก่อน (มีได้ทีละลิงก์) · คืนรหัสลิงก์ (แสดงได้ครั้งเดียว) */
export async function createPickLink(billId: string): Promise<{ token: string; link: PickLinkRow }> {
  const db = getServiceClient();
  await revokePickLinks(billId);
  const token = randomBytes(24).toString('base64url');
  const expiresAt = new Date(Date.now() + PICK_LINK_HOURS * 3_600_000).toISOString();
  const { data, error } = await db.from('pick_links').insert({ bill_id: billId, token_hash: hashToken(token), expires_at: expiresAt }).select('*').single();
  if (error) throw fromDbError(error);
  return { token, link: data as PickLinkRow };
}

export async function revokePickLinks(billId: string) {
  const { error } = await getServiceClient().from('pick_links').update({ revoked_at: new Date().toISOString() }).eq('bill_id', billId).is('revoked_at', null);
  if (error) throw fromDbError(error);
}

/** ลิงก์ที่ยังใช้งานได้ของบิล (ไม่รวมรหัส — เก็บแค่ hash) */
export async function getActivePickLink(billId: string): Promise<PickLinkRow | null> {
  const { data, error } = await getServiceClient()
    .from('pick_links')
    .select('id, bill_id, created_at, expires_at, revoked_at, last_saved_at, last_saved_by')
    .eq('bill_id', billId)
    .is('revoked_at', null)
    .gt('expires_at', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw fromDbError(error);
  return (data as PickLinkRow | null) ?? null;
}

/** ตรวจรหัสลิงก์จาก URL — ไม่พบ / ยกเลิก / หมดอายุ ตอบข้อความให้คนถือลิงก์เข้าใจ */
export async function resolvePickLink(token: string): Promise<PickLinkRow> {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) throw new ApiError(404, 'SR_LINK_INVALID', 'ลิงก์ไม่ถูกต้อง');
  const { data, error } = await getServiceClient().from('pick_links').select('*').eq('token_hash', hashToken(token)).maybeSingle();
  if (error) throw fromDbError(error);
  const link = data as PickLinkRow | null;
  if (!link) throw new ApiError(404, 'SR_LINK_INVALID', 'ลิงก์ไม่ถูกต้อง หรือถูกสร้างใหม่แล้ว — ขอลิงก์ใหม่จากแอดมิน');
  if (link.revoked_at) throw new ApiError(410, 'SR_LINK_REVOKED', 'ลิงก์นี้ถูกยกเลิกแล้ว — ขอลิงก์ใหม่จากแอดมิน');
  if (new Date(link.expires_at).getTime() < Date.now()) throw new ApiError(410, 'SR_LINK_EXPIRED', 'ลิงก์นี้หมดอายุแล้ว — ขอลิงก์ใหม่จากแอดมิน');
  return link;
}
