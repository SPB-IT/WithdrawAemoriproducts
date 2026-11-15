import Link from 'next/link';
import { DEFAULT_CLOSED_MESSAGE } from '@/lib/system-status';

// หน้าแจ้งว่าระบบถูกปิดชั่วคราว (แสดงแทนหน้าระบบสำหรับพนักงานสาขา)
export default function SystemClosedNotice({ title, message }: { title: string; message: string | null }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-gradient-to-br from-pink-50 via-white to-rose-50/40 px-4 py-10 text-slate-800">
      <div className="w-full max-w-md rounded-3xl border border-white bg-white p-8 text-center shadow-xl shadow-slate-200/60">
        <div className="text-5xl">🔒</div>
        <h1 className="mt-4 text-xl font-black">{title}</h1>
        <p className="mt-1 text-sm font-bold text-slate-400">ปิดใช้งานชั่วคราว</p>
        <p className="mt-4 whitespace-pre-line rounded-xl bg-slate-50 px-4 py-3 text-sm font-semibold leading-relaxed text-slate-600">{message?.trim() || DEFAULT_CLOSED_MESSAGE}</p>
        <Link href="/" className="mt-6 inline-block rounded-xl bg-gradient-to-r from-pink-500 to-rose-500 px-5 py-2.5 text-sm font-black text-white shadow-md hover:opacity-90">← กลับหน้าหลัก</Link>
      </div>
    </main>
  );
}
