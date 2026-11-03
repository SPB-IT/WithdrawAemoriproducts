// ไฟล์นี้เลิกใช้แล้ว — ระบบแจ้งสินค้าใกล้หมดฝั่งสำนักงานใหญ่ย้ายไป /admin/stock-request (ลบโฟลเดอร์นี้ทิ้งได้)
import { redirect } from 'next/navigation';

export default function LegacyHqRedirect() {
  redirect('/admin/stock-request');
}
