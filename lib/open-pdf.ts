import { saveAs } from 'file-saver';

/**
 * เปิดเอกสาร PDF ในแท็บใหม่ให้ดูรายละเอียด (ดาวน์โหลด/พิมพ์ได้จากตัว PDF)
 * target = แท็บที่เปิดไว้ตั้งแต่ตอนกดปุ่ม (กัน popup blocker) — ถ้าไม่มีจะดาวน์โหลดไฟล์แทน
 */
export function openPdfBlob(blob: Blob, filename: string, target: Window | null) {
  const url = URL.createObjectURL(blob);
  if (target && !target.closed) {
    target.location.href = url;
  } else {
    saveAs(blob, filename);
  }
  setTimeout(() => URL.revokeObjectURL(url), 5 * 60_000);
}
