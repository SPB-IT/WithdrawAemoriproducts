/**
 * โหมดทดสอบของระบบแจ้งสินค้าใกล้หมด
 * เปิดอยู่ (ค่าเริ่มต้น): ฝั่งสาขา /stock-request ต้องเข้าโหมดผู้ดูแล (รหัสกลาง) ก่อน และการ์ดหน้าแรกเป็นสีเทา
 * เปิดให้พนักงานใช้จริง: ตั้ง env STOCK_REQUEST_TESTING=false แล้ว deploy/restart ใหม่
 * (อ่านได้เฉพาะฝั่ง server — proxy.ts และ server component)
 */
export const STOCK_REQUEST_TESTING = process.env.STOCK_REQUEST_TESTING !== 'false';
