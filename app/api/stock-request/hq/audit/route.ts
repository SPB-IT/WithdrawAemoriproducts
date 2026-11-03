// ไฟล์นี้เลิกใช้แล้ว — ระบบแจ้งสินค้าใกล้หมดฝั่งสำนักงานใหญ่ย้ายไป /admin/stock-request (ลบโฟลเดอร์นี้ทิ้งได้)
import { NextResponse } from 'next/server';

const gone = () => NextResponse.json({ error: 'API นี้ย้ายไป /admin/stock-request/api แล้ว', code: 'SR_MOVED' }, { status: 410 });

export const GET = gone;
export const POST = gone;
export const PATCH = gone;
export const DELETE = gone;
