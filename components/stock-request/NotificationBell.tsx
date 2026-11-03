'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch } from '@/lib/stock-request/client';
import type { NotificationView } from '@/lib/stock-request/types';

const POLL_MS = 30_000;

/** กระดิ่งแจ้งเตือน: แสดงจำนวนที่ยังไม่อ่าน — กดครั้งเดียวทำเครื่องหมายอ่านทั้งหมด (ไม่มีรายการเด้ง) */
export default function NotificationBell({ endpoint }: { endpoint: string }) {
  const [unread, setUnread] = useState(0);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ notifications: NotificationView[] }>(endpoint);
      setUnread(data.notifications.filter((item) => !item.is_read).length);
    } catch {
      // โหลดไม่ได้ก็แค่ไม่แสดงตัวเลข — ลองใหม่รอบถัดไป
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

  const clearAll = async () => {
    if (unread === 0) return;
    setUnread(0);
    try {
      await apiFetch(`${endpoint}/read`, { method: 'POST', json: { ids: 'all' } });
    } catch {
      void load();
    }
  };

  return (
    <button
      type="button"
      onClick={clearAll}
      className="relative rounded-xl bg-white p-2.5 text-lg ring-1 ring-pink-100 transition hover:bg-pink-50"
      aria-label={unread > 0 ? `การแจ้งเตือน ${unread} รายการ — กดเพื่อล้างทั้งหมด` : 'ไม่มีการแจ้งเตือนใหม่'}
      title={unread > 0 ? 'กดเพื่อล้างการแจ้งเตือนทั้งหมด' : 'ไม่มีการแจ้งเตือนใหม่'}
    >
      🔔
      {unread > 0 && (
        <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-rose-500 px-1 text-[10px] font-black text-white">
          {unread > 9 ? '9+' : unread}
        </span>
      )}
    </button>
  );
}
