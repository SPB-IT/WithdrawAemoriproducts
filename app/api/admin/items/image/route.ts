import { NextResponse } from 'next/server';
import { requireAdminApi, serviceDb } from '@/lib/requisition-server';
import { ApiError, handle } from '@/lib/stock-request/errors';

export const dynamic = 'force-dynamic';

const BUCKET = 'product-images';
const MAX_BYTES = 5 * 1024 * 1024;
const TYPES: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp' };

// อัปโหลดรูปสินค้า (คลังสินค้า) — ตรวจชนิด/ขนาดไฟล์ฝั่ง server แล้วคืนลิงก์สาธารณะ
export const POST = handle(async (request: Request) => {
  await requireAdminApi();
  const form = await request.formData().catch(() => null);
  const file = form?.get('file');
  if (!(file instanceof File)) throw new ApiError(400, 'INVALID_INPUT', 'ไม่พบไฟล์รูปภาพ');
  const ext = TYPES[file.type];
  if (!ext) throw new ApiError(400, 'INVALID_FILE', 'รองรับเฉพาะไฟล์ JPG, PNG หรือ WEBP');
  if (file.size > MAX_BYTES) throw new ApiError(400, 'INVALID_FILE', 'ไฟล์รูปต้องไม่เกิน 5MB');

  const path = `products/${Date.now()}-${crypto.randomUUID().slice(0, 8)}.${ext}`;
  const storage = serviceDb().storage.from(BUCKET);
  const { error } = await storage.upload(path, file, { contentType: file.type, upsert: false });
  if (error) {
    console.error('[requisition] image upload', error);
    throw new ApiError(500, 'UPLOAD_FAILED', 'อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
  }
  return NextResponse.json({ url: storage.getPublicUrl(path).data.publicUrl });
});
