'use client';

import { supabase } from '@/lib/supabase';
import { SR_BUCKET } from './constants';
import type { UploadTarget } from './types';

export class ClientApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
  }
}

export async function apiFetch<T>(url: string, init: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, headers, ...rest } = init;
  let response: Response;
  try {
    response = await fetch(url, {
      ...rest,
      headers: { ...(json !== undefined ? { 'Content-Type': 'application/json' } : {}), ...headers },
      body: json !== undefined ? JSON.stringify(json) : rest.body,
      cache: 'no-store',
    });
  } catch {
    throw new ClientApiError('เชื่อมต่อเซิร์ฟเวอร์ไม่ได้ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่', 0);
  }
  const payload = (await response.json().catch(() => null)) as (T & { error?: string; code?: string }) | null;
  if (!response.ok) {
    throw new ClientApiError(payload?.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่', response.status, payload?.code);
  }
  return payload as T;
}

export function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่';
}

// ---------------------------------------------------------------------------
// Images
// ---------------------------------------------------------------------------
// ย่อรูปตอนอัปโหลด: ด้านยาว 1024px คุณภาพ 0.75 ≈ 60–110KB ต่อรูป (เดิม 1600px ≈ 170KB+) ยังเห็นสินค้า/ฉลากชัด
const MAX_EDGE = 1024;
const JPEG_QUALITY = 0.75;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];
const MAX_SOURCE_BYTES = 25 * 1024 * 1024;

export function validateImageFile(file: File): string | null {
  if (file.type && !ACCEPTED_TYPES.includes(file.type) && !file.type.startsWith('image/')) {
    return 'รองรับเฉพาะไฟล์รูปภาพ (JPG, PNG, WEBP)';
  }
  if (file.size > MAX_SOURCE_BYTES) return 'ไฟล์รูปใหญ่เกินไป (สูงสุด 25MB)';
  return null;
}

/** Resize to ≤1024px on the long edge and re-encode as JPEG (keeps uploads well under the 5MB bucket limit). */
export async function compressImage(source: Blob): Promise<Blob> {
  const bitmap = await createImageBitmap(source).catch(() => null);
  let width: number;
  let height: number;
  let draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void;

  if (bitmap) {
    width = bitmap.width;
    height = bitmap.height;
    draw = (ctx, w, h) => ctx.drawImage(bitmap, 0, 0, w, h);
  } else {
    const url = URL.createObjectURL(source);
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error('ไม่สามารถอ่านไฟล์รูปนี้ได้ กรุณาเลือกรูปอื่น'));
      img.src = url;
    }).finally(() => URL.revokeObjectURL(url));
    width = image.naturalWidth;
    height = image.naturalHeight;
    draw = (ctx, w, h) => ctx.drawImage(image, 0, 0, w, h);
  }

  const scale = Math.min(1, MAX_EDGE / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(width * scale);
  canvas.height = Math.round(height * scale);
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('อุปกรณ์นี้ไม่รองรับการประมวลผลรูป');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  draw(ctx, canvas.width, canvas.height);
  bitmap?.close();

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', JPEG_QUALITY));
  if (!blob) throw new Error('แปลงรูปไม่สำเร็จ กรุณาลองใหม่');
  return blob;
}

/** Ask our API for a signed upload slot, then upload the JPEG straight to Supabase Storage. */
export async function uploadPhoto(uploadUrlEndpoint: string, photo: Blob, body: Record<string, unknown> = {}): Promise<string> {
  const target = await apiFetch<UploadTarget>(uploadUrlEndpoint, { method: 'POST', json: body });
  const { error } = await supabase.storage
    .from(SR_BUCKET)
    .uploadToSignedUrl(target.path, target.token, photo, { contentType: 'image/jpeg', upsert: false });
  if (error) throw new Error('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่');
  return target.path;
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------
const dateTimeFormat = new Intl.DateTimeFormat('th-TH', {
  timeZone: 'Asia/Bangkok',
  day: 'numeric',
  month: 'short',
  year: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
});
const dateFormat = new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric' });

export function formatDateTime(value: string | null | undefined) {
  return value ? `${dateTimeFormat.format(new Date(value))} น.` : '-';
}

export function formatDate(value: string | null | undefined) {
  return value ? dateFormat.format(new Date(value)) : '-';
}

export function formatNumber(value: number | null | undefined) {
  return value === null || value === undefined ? '-' : value.toLocaleString('th-TH');
}

export function todayBangkok() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Bangkok' }).format(new Date());
}
