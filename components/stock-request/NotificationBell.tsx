'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch, formatDateTime } from '@/lib/stock-request/client';
import type { NotificationView } from '@/lib/stock-request/types';

const POLL_MS = 30_000;

/**
 * กระดิ่งแจ้งเตือน
 * - mode "clear" (ฝั่งสาขา): กดครั้งเดียวทำเครื่องหมายอ่านทั้งหมด ไม่มีรายการเด้ง
 * - mode "list" (หลังบ้าน): กดเพื่อดูรายการ (ทำเครื่องหมายอ่านทั้งหมดเมื่อเปิด) กดรายการเพื่อไปที่บิล
 */
export default function NotificationBell({
  endpoint,
  mode = 'clear',
  onOpenBill,
}: {
  endpoint: string;
  mode?: 'clear' | 'list';
  onOpenBill?: (billId: string) => void;
}) {
  const [items, setItems] = useState<NotificationView[]>([]);
  const [open, setOpen] = useState(false);
  const [failed, setFailed] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationView[] }>(endpoint);
      setItems(data.notifications);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, [endpoint]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, POLL_MS);
    const onFocus = () => void load();
    window.addEventListener('focus', onFocus);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
      window.removeEventListener('focus', onFocus);
    };
  }, [load]);

  useEffect(() => {
    if (!open) return;
    const onClick = (event: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    return () => document.removeEventListener('mousedown', onClick);
  }, [open]);

  const unread = items.filter((item) => !item.is_read).length;

  const markAllRead = async () => {
    if (unread === 0) return;
    setItems((current) => current.map((item) => ({ ...item, is_read: true })));
    try {
      await apiFetch(`${endpoint}/read`, { method: 'POST', json: { ids: 'all' } });
    } catch {
      void load();
    }
  };

  const onBellClick = () => {
    if (mode === 'clear') {
      void markAllRead();
      return;
    }
    const next = !open;
    setOpen(next);
    if (next) {
      void load();
      void markAllRead();
    }
  };

  return (
    <div className="relative" ref={panelRef}>
      <button
        type="button"
        onClick={onBellClick}
        className="relative rounded-xl bg-white p-2.5 text-lg ring-1 ring-pink-100 transition hover:bg-pink-50"
        aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการที่ยังไม่อ่าน` : 'การแจ้งเตือน'}
        aria-expanded={mode === 'list' ? open : undefined}
      >
        🔔
        {unread > 0 && (
          <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>
      {mode === 'list' && open && (
        <div className="fixed inset-x-3 top-24 z-40 overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-auto sm:mt-2 sm:w-[22rem]">
          <div className="flex items-center justify-between border-b border-pink-50 px-4 py-3">
            <p className="text-sm font-black text-slate-800">การแจ้งเตือน</p>
            <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="flex h-8 w-8 items-center justify-center rounded-full bg-slate-100 text-sm font-bold text-slate-500 hover:bg-rose-100 hover:text-rose-600">
              ✕
            </button>
          </div>
          <div className="max-h-96 overflow-y-auto">
            {failed && <p className="px-4 py-3 text-xs font-semibold text-rose-600">โหลดการแจ้งเตือนไม่สำเร็จ</p>}
            {items.length === 0 && !failed && <p className="px-4 py-8 text-center text-sm text-slate-400">ยังไม่มีการแจ้งเตือน</p>}
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => {
                  if (item.bill_id && onOpenBill) {
                    setOpen(false);
                    onOpenBill(item.bill_id);
                  }
                }}
                className="flex w-full gap-3 border-b border-slate-50 px-4 py-3 text-left transition hover:bg-pink-50/50"
              >
                <span className="min-w-0">
                  <span className="block text-sm font-bold text-slate-800">{item.title}</span>
                  {item.body && <span className="mt-0.5 block text-xs text-slate-500">{item.body}</span>}
                  <span className="mt-1 block text-[11px] text-slate-400">{formatDateTime(item.created_at)}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
