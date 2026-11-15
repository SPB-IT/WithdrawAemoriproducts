'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';

type Props = { system: 'requisition' | 'stock-request'; initialClosed: boolean; initialMessage: string | null };

// สวิตช์ปิด/เปิดระบบสำหรับพนักงานสาขา (ผู้ดูแลยังเข้าหลังบ้านและหน้าพนักงานได้ตามปกติ)
export default function SystemToggle({ system, initialClosed, initialMessage }: Props) {
  const router = useRouter();
  const [closed, setClosed] = useState(initialClosed);
  const [message, setMessage] = useState(initialMessage ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  async function save(nextClosed: boolean) {
    if (nextClosed && !window.confirm('ปิดระบบนี้? พนักงานสาขาจะเข้าใช้งานไม่ได้จนกว่าจะเปิดใหม่')) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/admin/system-status', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ system, closed: nextClosed, message: message.trim() || null }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'บันทึกไม่สำเร็จ');
      setClosed(nextClosed);
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'บันทึกไม่สำเร็จ');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`mt-2 rounded-2xl border px-4 py-3 text-xs ${closed ? 'border-rose-200 bg-rose-50' : 'border-slate-200 bg-white'}`}>
      <div className="flex items-center justify-between gap-3">
        <span className={`font-black ${closed ? 'text-rose-600' : 'text-emerald-600'}`}>{closed ? '🔒 ปิดอยู่ (พนักงานเข้าไม่ได้)' : '🟢 เปิดใช้งานปกติ'}</span>
        <button
          type="button"
          disabled={busy}
          onClick={() => save(!closed)}
          className={`rounded-lg px-3 py-1.5 font-black text-white shadow-sm transition disabled:opacity-50 ${closed ? 'bg-emerald-500 hover:bg-emerald-600' : 'bg-rose-500 hover:bg-rose-600'}`}
        >
          {busy ? 'กำลังบันทึก…' : closed ? 'เปิดระบบ' : 'ปิดระบบ'}
        </button>
      </div>
      <input
        value={message}
        maxLength={300}
        onChange={(e) => setMessage(e.target.value)}
        placeholder="ข้อความแจ้งพนักงาน (ไม่ใส่ก็ได้) เช่น เปิดให้ใช้ 1 ธ.ค."
        className="mt-2 w-full rounded-lg border border-slate-200 bg-white px-3 py-1.5 font-semibold text-slate-700 outline-none focus:border-pink-300"
      />
      {closed && message.trim() !== (initialMessage ?? '') && (
        <button type="button" disabled={busy} onClick={() => save(true)} className="mt-2 rounded-lg border border-rose-200 bg-white px-3 py-1 font-bold text-rose-600">
          บันทึกข้อความ
        </button>
      )}
      {error && <p className="mt-2 font-bold text-rose-600">{error}</p>}
    </div>
  );
}
