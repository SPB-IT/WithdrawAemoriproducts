// เรียก API ฝั่ง server ของระบบเบิกสินค้า (แทนการเขียนฐานข้อมูลจากเบราว์เซอร์)
// โยน Error พร้อมข้อความภาษาไทยจาก server เมื่อไม่สำเร็จ

export async function callApi<T = Record<string, unknown>>(url: string, method: 'POST' | 'PATCH' | 'DELETE' = 'POST', body?: unknown): Promise<T> {
  const init: RequestInit = { method, credentials: 'same-origin' };
  if (body instanceof FormData) {
    init.body = body;
  } else if (body !== undefined) {
    init.headers = { 'Content-Type': 'application/json' };
    init.body = JSON.stringify(body);
  }
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch {
    throw new Error('เชื่อมต่อระบบไม่สำเร็จ กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่');
  }
  const data = (await response.json().catch(() => ({}))) as T & { error?: string };
  if (!response.ok) throw new Error(data.error || 'เกิดข้อผิดพลาด กรุณาลองใหม่');
  return data;
}

export const errorText = (error: unknown) => (error instanceof Error ? error.message : 'เกิดข้อผิดพลาด กรุณาลองใหม่');
