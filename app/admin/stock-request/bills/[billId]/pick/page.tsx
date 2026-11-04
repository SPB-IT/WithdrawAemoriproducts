'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ConfirmDialog, ErrorState, InlineError, LoadingState, PhotoThumb, Spinner, StatusBadge, primaryButton } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';

const REFRESH_MS = 10_000;

// หน้าเช็คของ (มือถือ): ถือโทรศัพท์ไปจัดของในคลัง แตะการ์ดเพื่อติ๊กว่าเตรียมแล้ว — บันทึกในระบบ หลายคนช่วยกันได้
export default function PickingChecklistPage() {
  const { billId } = useParams<{ billId: string }>();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [confirmShip, setConfirmShip] = useState(false);
  const [shipping, setShipping] = useState(false);
  const [hidePicked, setHidePicked] = useState(false);

  const load = useCallback(async () => {
    try {
      setBill((await apiFetch<{ bill: BillDetail }>(`/admin/stock-request/api/bills/${billId}`)).bill);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [billId]);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  const toggle = async (item: BillItemDetail) => {
    const picked = !item.picked_at;
    setBusyId(item.id);
    setActionError(null);
    // แสดงผลทันที แล้วค่อยยืนยันกับ server
    setBill((current) =>
      current && { ...current, items: current.items.map((row) => (row.id === item.id ? { ...row, picked_at: picked ? new Date().toISOString() : null } : row)) },
    );
    try {
      await apiFetch(`/admin/stock-request/api/items/${item.id}/pick`, { method: 'POST', json: { picked } });
    } catch (err) {
      setActionError(errorMessage(err));
      void load();
    } finally {
      setBusyId(null);
    }
  };

  const ship = async () => {
    if (!bill) return;
    setShipping(true);
    setActionError(null);
    try {
      await apiFetch(`/admin/stock-request/api/bills/${bill.id}/ship`, { method: 'POST', json: { expectedVersion: bill.version } });
      setConfirmShip(false);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
      setConfirmShip(false);
      void load();
    } finally {
      setShipping(false);
    }
  };

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState label="กำลังโหลดรายการ..." />;

  const items = bill.items.filter((item) => !item.is_removed);
  const pickedCount = items.filter((item) => item.picked_at).length;
  const allPicked = items.length > 0 && pickedCount === items.length;
  const shown = hidePicked ? items.filter((item) => !item.picked_at) : items;
  const pickable = bill.status === 'billed';

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <Link href="/admin/stock-request/pick" className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← บิลที่รอจัดของ
      </Link>

      <section className="sticky top-2 z-20 rounded-2xl border border-pink-100 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-black">{bill.branch_name}</p>
            <p className="font-mono text-xs text-slate-500">{bill.bill_no}</p>
          </div>
          <StatusBadge status={bill.status} />
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${allPicked ? 'bg-emerald-500' : 'bg-linear-to-r from-pink-500 to-rose-400'}`} style={{ width: `${items.length ? (pickedCount / items.length) * 100 : 0}%` }} />
          </div>
          <span className={`text-sm font-black ${allPicked ? 'text-emerald-600' : 'text-pink-600'}`}>
            {pickedCount}/{items.length}
          </span>
        </div>
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
          <input type="checkbox" checked={hidePicked} onChange={(event) => setHidePicked(event.target.checked)} className="h-4 w-4 accent-pink-500" />
          ซ่อนรายการที่เตรียมแล้ว
        </label>
      </section>

      {!pickable && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
          {bill.status === 'pending' ? 'บิลนี้ยังไม่ถูกตัด — เช็คของได้หลังตัดบิล' : 'บิลนี้จัดส่งแล้ว — ดูรายการได้อย่างเดียว'}
        </p>
      )}
      <InlineError message={actionError} />

      <ul className="space-y-3">
        {shown.map((item) => {
          const sub = item.substitution;
          const picked = Boolean(item.picked_at);
          return (
            <li key={item.id}>
              {/* ทั้งการ์ดเป็น checkbox (div เพราะข้างในมีปุ่มขยายรูป — ปุ่มซ้อนปุ่มไม่ได้) */}
              <div
                role="checkbox"
                aria-checked={picked}
                aria-disabled={!pickable || busyId === item.id}
                tabIndex={pickable ? 0 : -1}
                onClick={() => pickable && busyId !== item.id && toggle(item)}
                onKeyDown={(event) => {
                  if ((event.key === 'Enter' || event.key === ' ') && pickable && busyId !== item.id) {
                    event.preventDefault();
                    void toggle(item);
                  }
                }}
                className={`flex w-full items-center gap-3 rounded-2xl border-2 p-3 text-left transition ${pickable ? 'cursor-pointer active:scale-[0.99]' : ''} ${picked ? 'border-emerald-300 bg-emerald-50' : 'border-pink-100 bg-white shadow-sm'}`}
              >
                <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border-2 text-xl font-black ${picked ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300 bg-white text-transparent'}`}>
                  {busyId === item.id ? <Spinner className="h-5 w-5 text-pink-500" /> : '✓'}
                </span>
                <span onClick={(event) => event.stopPropagation()}>
                  <PhotoThumb url={sub?.photo_url ?? item.photo_url} alt={sub?.product_name ?? item.product_name} className="h-20 w-20" />
                </span>
                <span className="min-w-0 flex-1">
                  {sub ? (
                    <>
                      <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">จัดตัวนี้แทน</span>
                      <span className={`block text-base font-black ${picked ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{sub.product_name}</span>
                      <span className="block text-xs font-bold text-slate-500">รหัส {sub.product_code}</span>
                      <span className="block text-[11px] text-slate-400">
                        แทน {item.product_name} ({item.product_code})
                      </span>
                    </>
                  ) : (
                    <>
                      <span className={`block text-base font-black ${picked ? 'text-slate-500 line-through' : 'text-slate-800'}`}>{item.product_name}</span>
                      <span className="block text-xs font-bold text-slate-500">รหัส {item.product_code}</span>
                    </>
                  )}
                  <span className="mt-1 block text-xs text-slate-500">
                    คงเหลือที่สาขา <b className="text-pink-700">{formatNumber(item.stock_on_hand)}</b>
                  </span>
                  {(item.hq_note || item.staff_note) && (
                    <span className="mt-1 block text-[11px] text-slate-500">{[item.hq_note && `HQ: ${item.hq_note}`, item.staff_note && `สาขา: ${item.staff_note}`].filter(Boolean).join(' · ')}</span>
                  )}
                  {picked && <span className="mt-1 block text-[11px] font-bold text-emerald-700">เตรียมแล้ว · {formatDateTime(item.picked_at)}</span>}
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      {hidePicked && shown.length === 0 && <p className="py-6 text-center text-sm font-bold text-emerald-600">✅ เตรียมครบทุกรายการแล้ว</p>}

      {pickable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-pink-100 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            <button type="button" disabled={!allPicked} onClick={() => setConfirmShip(true)} className={`${primaryButton} w-full py-3.5 text-base`}>
              {allPicked ? '🚚 เตรียมครบแล้ว · ยืนยันจัดส่ง' : `เหลืออีก ${items.length - pickedCount} รายการ`}
            </button>
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmShip}
        title="ยืนยันจัดส่งสินค้า"
        confirmLabel="ยืนยันจัดส่ง"
        busy={shipping}
        onCancel={() => setConfirmShip(false)}
        onConfirm={ship}
        message={`เปลี่ยนสถานะบิล ${bill.bill_no} เป็น “จัดส่งแล้ว” — สาขาจะได้รับแจ้งเตือนให้ยืนยันเมื่อได้รับสินค้า`}
      />
    </div>
  );
}
