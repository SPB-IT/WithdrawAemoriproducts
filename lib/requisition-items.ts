import 'server-only';
import { dbError, serviceDb } from '@/lib/requisition-server';
import { ApiError } from '@/lib/stock-request/errors';
import { optionalText, requireText } from '@/lib/stock-request/validation';

export interface ItemInput {
  product_code: string;
  name: string;
  unit: string;
  price: number;
  is_active: boolean;
  image_url: string | null;
  stock_quantity: number;
}

const toNumber = (value: unknown) => (typeof value === 'string' && value.trim() !== '' ? Number(value) : value);

/** ตรวจข้อมูลสินค้าจากฟอร์มคลังสินค้า (หลังบ้านระบบเบิก) */
export function parseItemInput(body: Record<string, unknown>): ItemInput {
  const price = toNumber(body.price ?? 0);
  if (typeof price !== 'number' || !Number.isFinite(price) || price < 0 || price > 10_000_000) {
    throw new ApiError(400, 'INVALID_INPUT', 'ราคาสินค้าต้องเป็นตัวเลขและไม่ติดลบ');
  }
  const stock = toNumber(body.stock_quantity ?? 0);
  if (typeof stock !== 'number' || !Number.isFinite(stock) || stock < 0 || stock > 10_000_000) {
    throw new ApiError(400, 'INVALID_INPUT', 'จำนวนคงเหลือต้องไม่ติดลบ');
  }
  const imageUrl = optionalText(body.image_url, 500);
  if (imageUrl && !/^https:\/\//.test(imageUrl)) throw new ApiError(400, 'INVALID_INPUT', 'ลิงก์รูปภาพไม่ถูกต้อง');
  return {
    product_code: optionalText(body.product_code, 100) ?? '',
    name: requireText(body.name, 200, 'ชื่อสินค้า'),
    unit: requireText(body.unit, 50, 'หน่วยนับ'),
    price: Math.round(price * 100) / 100,
    is_active: body.is_active !== false,
    image_url: imageUrl,
    stock_quantity: Math.floor(stock),
  };
}

/** รหัสสินค้าห้ามซ้ำ (ไม่สนตัวพิมพ์เล็กใหญ่) */
export async function assertUniqueCode(code: string, exceptId?: string) {
  if (!code) return;
  const { data, error } = await serviceDb().from('items').select('id, product_code').ilike('product_code', code);
  if (error) throw dbError(error, 'ตรวจรหัสสินค้าไม่สำเร็จ');
  const clash = (data ?? []).some((row: { id: string; product_code: string | null }) => row.id !== exceptId && (row.product_code ?? '').trim().toLowerCase() === code.toLowerCase());
  if (clash) throw new ApiError(409, 'DUPLICATE', 'รหัสสินค้านี้มีอยู่ในระบบแล้ว');
}
