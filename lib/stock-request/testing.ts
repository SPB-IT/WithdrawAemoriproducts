/**
 * โหมดทดสอบของระบบแจ้งสินค้าใกล้หมด
 * ปิดอยู่ (ค่าเริ่มต้น — เปิดใช้งานจริง): พนักงานเข้า /stock-request ได้เลย การ์ดหน้าแรกเป็นสีชมพู
 * ต้องการล็อกกลับเป็นช่วงทดสอบ: ตั้ง env STOCK_REQUEST_TESTING=true แล้ว deploy/restart ใหม่
 * (ฝั่งสาขาต้องใส่รหัสผู้ดูแลก่อน และการ์ดหน้าแรกเป็นสีเทา)
 * (อ่านได้เฉพาะฝั่ง server — proxy.ts และ server component)
 */
export const STOCK_REQUEST_TESTING = process.env.STOCK_REQUEST_TESTING === 'true';
