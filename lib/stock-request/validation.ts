import { ApiError } from './errors';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== 'object' || Array.isArray(body)) {
    throw new ApiError(400, 'SR_INVALID_INPUT', 'รูปแบบข้อมูลไม่ถูกต้อง');
  }
  return body as Record<string, unknown>;
}

export function isUuid(value: unknown): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export function requireUuid(value: unknown, label = 'รหัส'): string {
  if (!isUuid(value)) throw new ApiError(400, 'SR_INVALID_INPUT', `${label}ไม่ถูกต้อง`);
  return value.toLowerCase();
}

export function optionalText(value: unknown, max: number): string | null {
  if (value === undefined || value === null) return null;
  if (typeof value !== 'string') throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อความไม่ถูกต้อง');
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.length > max) throw new ApiError(400, 'SR_INVALID_INPUT', `ข้อความยาวเกิน ${max} ตัวอักษร`);
  return trimmed;
}

export function requireText(value: unknown, max: number, label: string): string {
  const text = optionalText(value, max);
  if (!text) throw new ApiError(400, 'SR_INVALID_INPUT', `กรุณากรอก${label}`);
  return text;
}

export function optionalInt(value: unknown, label: string): number | null {
  if (value === undefined || value === null || value === '') return null;
  const num = typeof value === 'string' ? Number(value) : value;
  if (typeof num !== 'number' || !Number.isInteger(num) || num < 0 || num > 1_000_000) {
    throw new ApiError(400, 'SR_INVALID_INPUT', `${label}ต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป`);
  }
  return num;
}

/** จำนวนที่สาขาสั่ง: จำนวนเต็มอย่างน้อย 1 */
export function requireOrderQty(value: unknown, label = 'จำนวนที่ต้องการสั่ง'): number {
  const num = optionalInt(value, label);
  if (num === null) throw new ApiError(400, 'SR_INVALID_INPUT', `กรุณากรอก${label}`);
  if (num < 1) throw new ApiError(400, 'SR_INVALID_INPUT', `${label}ต้องอย่างน้อย 1`);
  return num;
}

export function requireInt(value: unknown, label: string): number {
  const num = optionalInt(value, label);
  if (num === null) throw new ApiError(400, 'SR_INVALID_INPUT', `กรุณากรอก${label}`);
  return num;
}

export function requireVersion(value: unknown): number {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 1) {
    throw new ApiError(400, 'SR_INVALID_INPUT', 'ข้อมูลเวอร์ชันบิลไม่ถูกต้อง กรุณาโหลดหน้าใหม่');
  }
  return value;
}

export function parseBranchId(value: unknown): number | null {
  const num = typeof value === 'string' ? Number(value) : value;
  return typeof num === 'number' && Number.isInteger(num) && num > 0 ? num : null;
}

/** YYYY-MM-DD (Bangkok) → ISO timestamp at the start/end of that day in Asia/Bangkok. */
export function bangkokDayBoundary(date: string | null, end: boolean): string | null {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  return `${date}T${end ? '23:59:59.999' : '00:00:00.000'}+07:00`;
}
