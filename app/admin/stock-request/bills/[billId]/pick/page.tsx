'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import CameraCapture from '@/components/stock-request/CameraCapture';
import PickLinkButton from '@/components/stock-request/PickLinkButton';
import ShipDialog from '@/components/stock-request/ShipDialog';
import { ConfirmDialog, ErrorState, Field, InlineError, LoadingState, Modal, PhotoThumb, Spinner, StatusBadge, inputClass, primaryButton, secondaryButton } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber, uploadPhoto } from '@/lib/stock-request/client';
import { isPartial } from '@/lib/stock-request/qty';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';

const REFRESH_MS = 10_000;
const PICKER_KEY = 'sr_picker_names'; // ชื่อผู้แพ็คของที่เคยใช้ในเครื่องนี้

function readPickers(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(PICKER_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

function savePicker(name: string) {
  try {
    localStorage.setItem(PICKER_KEY, JSON.stringify([name, ...readPickers().filter((item) => item !== name)].slice(0, 8)));
  } catch {
    // ไม่กระทบการเช็คของ
  }
}

// หน้าแพ็คของ (มือถือ): ถือโทรศัพท์ไปแพ็คของในคลัง แตะการ์ดเพื่อติ๊กว่าแพ็คแล้ว — บันทึกในระบบ หลายคนช่วยกันได้
export default function PickingChecklistPage() {
  const { billId } = useParams<{ billId: string }>();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [hidePicked, setHidePicked] = useState(false);
  const [shipOpen, setShipOpen] = useState(false);
  const [rejecting, setRejecting] = useState<BillItemDetail | null>(null);
  const [partialItem, setPartialItem] = useState<BillItemDetail | null>(null);
  const [substituting, setSubstituting] = useState<BillItemDetail | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // ลงชื่อผู้เช็คของ — ต้องมีก่อนติ๊ก/ปฏิเสธ/ทดแทน
  const [picker, setPicker] = useState('');
  const [pickers, setPickers] = useState<string[]>([]);
  const [pickerMissing, setPickerMissing] = useState(false);
  const pickerRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const list = readPickers();
      setPickers(list);
      setPicker(list[0] ?? '');
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  /** ยังไม่ลงชื่อ → เลื่อนไปที่ช่องชื่อ + กรอบแดง และไม่ทำต่อ */
  const requirePicker = () => {
    const name = picker.trim();
    if (name) {
      savePicker(name);
      return name;
    }
    setPickerMissing(true);
    pickerRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    pickerRef.current?.focus({ preventScroll: true });
    return null;
  };

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
    const pickerName = picked ? requirePicker() : picker.trim();
    if (picked && !pickerName) return;
    setBusyId(item.id);
    setActionError(null);
    // แสดงผลทันที แล้วค่อยยืนยันกับ server
    setBill((current) =>
      current && { ...current, items: current.items.map((row) => (row.id === item.id ? { ...row, picked_at: picked ? new Date().toISOString() : null, picked_by: picked ? pickerName : null } : row)) },
    );
    try {
      await apiFetch(`/admin/stock-request/api/items/${item.id}/pick`, { method: 'POST', json: { picked, pickerName } });
    } catch (err) {
      setActionError(errorMessage(err));
      void load();
    } finally {
      setBusyId(null);
    }
  };

  // ไม่มีของ / นำกลับ — บิลตัดแล้วจึงต้องมีเหตุผลทุกครั้ง (เก็บใน Audit Log และแจ้งสาขา)
  const setRemoved = async (item: BillItemDetail, removed: boolean, reason: string) => {
    if (!bill) return;
    await apiFetch(`/admin/stock-request/api/items/${item.id}/remove`, { method: 'POST', json: { expectedVersion: bill.version, removed, reason: withPicker(reason) } });
    setNotice(removed ? `ปฏิเสธ “${item.product_name}” แล้ว` : `นำ “${item.product_name}” กลับเข้าบิลแล้ว`);
    await load();
  };

  const withPicker = (reason: string) => (picker.trim() ? `${reason} · ผู้แพ็คของ: ${picker.trim()}` : reason);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState label="กำลังโหลดรายการ..." />;

  const items = bill.items.filter((item) => !item.is_removed);
  const pickedCount = items.filter((item) => item.picked_at).length;
  const allPicked = items.length > 0 && pickedCount === items.length;
  const shown = hidePicked ? items.filter((item) => !item.picked_at) : items;
  const pickable = bill.status === 'billed';
  const removedItems = bill.items.filter((item) => item.is_removed);
  const removeReason = (item: BillItemDetail) =>
    bill.audit_logs.find((log) => log.bill_item_id === item.id && log.action === 'item_remove')?.reason ?? null;

  return (
    <div className="mx-auto max-w-2xl space-y-4 pb-28">
      <Link href="/admin/stock-request/pick" className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← บิลที่รอแพ็คของ
      </Link>

      <section className="sticky top-2 z-20 rounded-2xl border border-pink-100 bg-white/95 p-4 shadow-sm backdrop-blur">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-black">{bill.branch_name}</p>
            <p className="font-mono text-xs text-slate-500">{bill.bill_no}</p>
          </div>
          <div className="flex flex-col items-end gap-1.5">
            <StatusBadge status={bill.status} />
            {pickable && <PickLinkButton billId={bill.id} billNo={bill.bill_no} branchName={bill.branch_name} className="rounded-lg bg-pink-50 px-2.5 py-1 text-xs font-bold text-pink-700 hover:bg-pink-100" />}
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${allPicked ? 'bg-emerald-500' : 'bg-linear-to-r from-pink-500 to-rose-400'}`} style={{ width: `${items.length ? (pickedCount / items.length) * 100 : 0}%` }} />
          </div>
          <span className={`text-sm font-black ${allPicked ? 'text-emerald-600' : 'text-pink-600'}`}>
            {pickedCount}/{items.length}
          </span>
        </div>
        {pickable && (
          <div className="mt-3">
            <label className="block text-xs font-black text-slate-600">
              ผู้แพ็คของ <span className="text-rose-500">*</span>
              <input
                ref={pickerRef}
                value={picker}
                onChange={(event) => {
                  setPicker(event.target.value);
                  if (event.target.value.trim()) setPickerMissing(false);
                }}
                className={`${inputClass} mt-1 ${pickerMissing ? 'border-rose-400 ring-4 ring-rose-100' : ''}`}
                placeholder="ชื่อคนที่แพ็คของ"
                maxLength={100}
              />
            </label>
            {pickerMissing && <p className="mt-1 text-xs font-bold text-rose-600">⚠️ ลงชื่อผู้แพ็คของก่อน แล้วค่อยติ๊กรายการ</p>}
            {pickers.length > 0 && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {pickers.map((name) => {
                  const active = name === picker.trim();
                  return (
                    <button
                      key={name}
                      type="button"
                      onClick={() => {
                        setPicker(name);
                        setPickerMissing(false);
                      }}
                      className={`rounded-full px-3 py-1 text-xs font-bold ring-1 transition ${active ? 'bg-pink-500 text-white ring-pink-500' : 'bg-pink-50 text-pink-700 ring-pink-100'}`}
                    >
                      {active ? '✓' : '👤'} {name}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}
        <label className="mt-3 flex items-center gap-2 text-xs font-bold text-slate-500">
          <input type="checkbox" checked={hidePicked} onChange={(event) => setHidePicked(event.target.checked)} className="h-4 w-4 accent-pink-500" />
          ซ่อนรายการที่แพ็คแล้ว
        </label>
      </section>

      {!pickable && (
        <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">
          {bill.status === 'pending' ? 'บิลนี้ยังไม่ถูกตัด — แพ็คของได้หลังตัดบิล' : 'บิลนี้จัดส่งแล้ว — ดูรายการได้อย่างเดียว'}
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
                    สั่ง <b className="text-pink-700">{formatNumber(item.stock_on_hand)}</b> ชิ้น
                  </span>
                  {(item.hq_note || item.staff_note) && (
                    <span className="mt-1 block text-[11px] text-slate-500">{[item.hq_note && `HQ: ${item.hq_note}`, item.staff_note && `สาขา: ${item.staff_note}`].filter(Boolean).join(' · ')}</span>
                  )}
                  {picked && isPartial(item) && (
                    <span className="mt-1 block rounded-lg bg-amber-100 px-2 py-0.5 text-[11px] font-black text-amber-800">
                      ⚠️ ของไม่พอ แพ็คได้ {formatNumber(item.hq_ship_qty)}/{formatNumber(item.stock_on_hand)} ชิ้น
                    </span>
                  )}
                  {picked && (
                    <span className="mt-1 block text-[11px] font-bold text-emerald-700">
                      แพ็คแล้ว{item.picked_by ? ` โดย ${item.picked_by}` : ''} · {formatDateTime(item.picked_at)}
                    </span>
                  )}
                </span>
              </div>
              {pickable && (
                <div className={`mt-1.5 grid gap-1.5 text-xs font-bold ${(item.stock_on_hand ?? 0) > 1 ? 'grid-cols-3' : 'grid-cols-2'}`}>
                  {(item.stock_on_hand ?? 0) > 1 && (
                    <button type="button" onClick={() => requirePicker() && setPartialItem(item)} className="rounded-xl bg-amber-50 py-2 text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100">
                      ⚠️ ได้ไม่ครบ
                    </button>
                  )}
                  <button type="button" onClick={() => requirePicker() && setRejecting(item)} className="rounded-xl bg-rose-50 py-2 text-rose-600 ring-1 ring-rose-100 hover:bg-rose-100">
                    ✖ ไม่มีของ / ปฏิเสธ
                  </button>
                  <button type="button" onClick={() => requirePicker() && setSubstituting(item)} className="rounded-xl bg-amber-50 py-2 text-amber-700 ring-1 ring-amber-100 hover:bg-amber-100">
                    🔁 {sub ? 'เปลี่ยนสินค้าทดแทน' : 'ใช้สินค้าทดแทน'}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
      {hidePicked && shown.length === 0 && <p className="py-6 text-center text-sm font-bold text-emerald-600">✅ แพ็คครบทุกรายการแล้ว</p>}

      {removedItems.length > 0 && (
        <section className="rounded-2xl border border-rose-100 bg-rose-50/40 p-3">
          <p className="mb-2 text-sm font-black text-rose-700">ไม่ได้จัดส่ง ({removedItems.length})</p>
          <ul className="space-y-2">
            {removedItems.map((item) => (
              <li key={item.id} className="flex items-center gap-3 rounded-xl bg-white p-2.5 ring-1 ring-rose-100">
                <div className="min-w-0 flex-1 text-xs">
                  <p className="font-bold text-slate-500 line-through">{item.product_name}</p>
                  <p className="text-slate-400">รหัส {item.product_code}</p>
                  {removeReason(item) && <p className="mt-0.5 font-semibold text-rose-600">เหตุผล: {removeReason(item)}</p>}
                </div>
                {pickable && (
                  <button
                    type="button"
                    onClick={() => setRemoved(item, false, 'นำกลับจากหน้าแพ็คของ').catch((err) => setActionError(errorMessage(err)))}
                    className="shrink-0 rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600 hover:bg-slate-200"
                  >
                    ↩ นำกลับ
                  </button>
                )}
              </li>
            ))}
          </ul>
        </section>
      )}

      {notice && (
        <div role="status" className="pointer-events-none fixed inset-x-3 top-3 z-[70] mx-auto max-w-md rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-xl">
          ✅ {notice}
        </div>
      )}

      <PartialDialog
        item={partialItem}
        onClose={() => setPartialItem(null)}
        onConfirm={async (qty, reason) => {
          if (!partialItem) return;
          await apiFetch(`/admin/stock-request/api/items/${partialItem.id}/pick`, { method: 'POST', json: { picked: true, pickerName: picker.trim(), qty, reason } });
          setPartialItem(null);
          setNotice(`บันทึกแล้ว: ${partialItem.product_name} แพ็คได้ ${qty}/${partialItem.stock_on_hand} ชิ้น`);
          await load();
        }}
      />
      <RejectDialog
        item={rejecting}
        onClose={() => setRejecting(null)}
        onConfirm={async (reason) => {
          if (!rejecting) return;
          await setRemoved(rejecting, true, reason);
          setRejecting(null);
        }}
      />
      <SubstituteDialog
        item={substituting}
        bill={bill}
        picker={picker.trim()}
        onClose={() => setSubstituting(null)}
        onSaved={async (name) => {
          setSubstituting(null);
          setNotice(`ใช้ “${name}” แทนแล้ว`);
          await load();
        }}
      />

      <ShipDialog
        open={shipOpen}
        billNo={bill.bill_no}
        summary={`แพ็คของเสร็จ ${pickedCount} รายการ${picker.trim() ? ` (ผู้แพ็ค ${picker.trim()})` : ''}`}
        onClose={() => setShipOpen(false)}
        onShip={async (shipperName) => {
          await apiFetch(`/admin/stock-request/api/bills/${bill.id}/ship`, { method: 'POST', json: { expectedVersion: bill.version, shipperName } });
          setShipOpen(false);
          setNotice(`บิล ${bill.bill_no} จัดส่งแล้ว`);
          await load();
        }}
      />

      {pickable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-pink-100 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-2xl">
            {/* ติ๊กครบ = แพ็คของเสร็จ (ติ๊กถูกในไทม์ไลน์) · จากนั้นกด "จัดส่ง" แยกอีกขั้น (ใส่ชื่อผู้ส่ง) */}
            {allPicked ? (
              <div className="flex gap-2">
                <Link href={`/admin/stock-request/bills/${bill.id}`} className={`${secondaryButton} shrink-0 py-3.5`}>
                  ✅ แพ็คเสร็จ · หน้าบิล
                </Link>
                <button type="button" onClick={() => setShipOpen(true)} className={`${primaryButton} flex-1 py-3.5 text-base`}>
                  🚚 จัดส่ง
                </button>
              </div>
            ) : (
              <button type="button" disabled className={`${primaryButton} w-full py-3.5 text-base`}>
                📦 กำลังแพ็คของ · เหลืออีก {items.length - pickedCount} รายการ
              </button>
            )}
          </div>
        </div>
      )}

    </div>
  );
}

// ปฏิเสธรายการ (ไม่มีของ) — ต้องมีหมายเหตุทุกครั้ง
function RejectDialog({ item, onClose, onConfirm }: { item: BillItemDetail | null; onClose: () => void; onConfirm: (reason: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = ['สินค้าหมดสต็อก', 'รอสินค้าเข้า', 'สินค้าเลิกขาย'];

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      setReason('');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item]);

  const confirm = async () => {
    if (!reason.trim()) return setError('กรุณาระบุหมายเหตุ/เหตุผลที่ปฏิเสธ');
    setBusy(true);
    setError(null);
    try {
      await onConfirm(reason.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(item)}
      title="ปฏิเสธรายการนี้"
      tone="danger"
      confirmLabel="ยืนยันปฏิเสธ"
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
      message={
        <>
          <b>{item?.product_name}</b> ({item?.product_code}) จะไม่ถูกจัดส่ง — สาขาจะเห็นเหตุผลในประวัติ
        </>
      }
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {quick.map((text) => (
            <button key={text} type="button" onClick={() => setReason(text)} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 ring-1 ring-rose-100">
              {text}
            </button>
          ))}
        </div>
        <textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          className={`${inputClass} min-h-20 ${error ? 'border-rose-400 ring-4 ring-rose-100' : ''}`}
          maxLength={1000}
          placeholder="หมายเหตุ (บังคับ) เช่น สินค้าหมดสต็อก"
          autoFocus
        />
        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}

// ใช้สินค้าทดแทน (จากหน้าเช็คของ) — สินค้าเดิมยังเก็บไว้ในประวัติ
function SubstituteDialog({ item, bill, picker, onClose, onSaved }: { item: BillItemDetail | null; bill: BillDetail; picker: string; onClose: () => void; onSaved: (name: string) => Promise<void> }) {
  const [form, setForm] = useState({ name: '', code: '', reason: '' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      setForm({ name: '', code: '', reason: '' });
      setPhoto(null);
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    if (!form.name.trim() || !form.code.trim()) return setError('กรุณากรอกชื่อและรหัสสินค้าทดแทน');
    if (!form.reason.trim()) return setError('กรุณาระบุเหตุผลในการเปลี่ยนสินค้า');
    setBusy(true);
    setError(null);
    try {
      const photoPath = photo ? await uploadPhoto('/admin/stock-request/api/upload-url', photo, { billId: bill.id }) : null;
      await apiFetch(`/admin/stock-request/api/items/${item.id}/substitution`, {
        method: 'POST',
        json: { expectedVersion: bill.version, productName: form.name.trim(), productCode: form.code.trim(), reason: picker ? `${form.reason.trim()} · ผู้แพ็คของ: ${picker}` : form.reason.trim(), photoPath },
      });
      await onSaved(form.name.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal
      open={Boolean(item)}
      onClose={busy ? () => undefined : onClose}
      title="ใช้สินค้าทดแทน"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
            ยกเลิก
          </button>
          <button type="submit" form="pick-sub-form" disabled={busy} className={primaryButton}>
            {busy && <Spinner className="h-4 w-4" />}
            บันทึกสินค้าทดแทน
          </button>
        </div>
      }
    >
      {item && (
        <form id="pick-sub-form" onSubmit={submit} className="space-y-3">
          <p className="rounded-xl bg-slate-50 px-3 py-2 text-xs text-slate-600">
            แทน <b>{item.product_name}</b> ({item.product_code}) — สินค้าเดิมยังเก็บไว้ในประวัติ
          </p>
          <div className="grid grid-cols-2 gap-3">
            <Field label="ชื่อสินค้าทดแทน" required>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={200} />
            </Field>
            <Field label="รหัสสินค้าทดแทน" required>
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} maxLength={100} />
            </Field>
          </div>
          <Field label="เหตุผล" required>
            <textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={`${inputClass} min-h-16`} maxLength={1000} placeholder="เช่น สินค้าเดิมหมด ใช้รุ่นใกล้เคียงแทน" />
          </Field>
          <Field label="รูปสินค้าทดแทน (ไม่บังคับ)">
            <CameraCapture value={photo} onChange={setPhoto} />
          </Field>
          <InlineError message={error} />
        </form>
      )}
    </Modal>
  );
}

// ของไม่พอ: แพ็คได้น้อยกว่าที่สาขาสั่ง — ใส่จำนวนที่แพ็คได้จริง + เหตุผล (บันทึกประวัติและแจ้งสาขา)
function PartialDialog({ item, onClose, onConfirm }: { item: BillItemDetail | null; onClose: () => void; onConfirm: (qty: number, reason: string) => Promise<void> }) {
  const [qty, setQty] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = ['ของในคลังไม่พอ', 'ของเสียบางส่วน', 'รอของเข้าเพิ่ม'];
  const ordered = item?.stock_on_hand ?? 0;

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      setQty(item.hq_ship_qty !== null && item.hq_ship_qty < ordered ? String(item.hq_ship_qty) : '');
      setReason('');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item, ordered]);

  const confirm = async () => {
    const value = Number(qty);
    if (!qty || !Number.isInteger(value) || value < 1 || value >= ordered) return setError(`ใส่จำนวนที่แพ็คได้ระหว่าง 1 ถึง ${ordered - 1} ชิ้น (ถ้าไม่มีเลยให้กด “ไม่มีของ”)`);
    if (!reason.trim()) return setError('กรุณาระบุเหตุผลที่ส่งไม่ครบ');
    setBusy(true);
    setError(null);
    try {
      await onConfirm(value, reason.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(item)}
      title="ของไม่พอ ส่งได้ไม่ครบ"
      confirmLabel="บันทึกจำนวนที่แพ็คได้"
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
      message={
        <>
          <b>{item?.substitution?.product_name ?? item?.product_name}</b> · สาขาสั่ง <b>{formatNumber(ordered)}</b> ชิ้น — ใส่จำนวนที่แพ็คได้จริง สาขาจะเห็นว่าได้กี่ชิ้นและเพราะอะไร
        </>
      }
    >
      <div className="space-y-2">
        <label className="block text-xs font-black text-slate-600" htmlFor="partial-qty">
          แพ็คได้จริง (ชิ้น)
        </label>
        <div className="flex items-center gap-2">
          <input
            id="partial-qty"
            value={qty}
            onChange={(event) => setQty(event.target.value.replace(/[^0-9]/g, ''))}
            inputMode="numeric"
            className={`${inputClass} w-28 text-center text-lg font-black`}
            placeholder="0"
          />
          <span className="text-sm text-slate-500">จาก {formatNumber(ordered)} ชิ้น{qty && Number(qty) < ordered ? ` · ขาด ${ordered - Number(qty)} ชิ้น` : ''}</span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          {quick.map((text) => (
            <button key={text} type="button" onClick={() => setReason(text)} className="rounded-full bg-amber-50 px-3 py-1 text-xs font-bold text-amber-800 ring-1 ring-amber-200">
              {text}
            </button>
          ))}
        </div>
        <textarea value={reason} onChange={(event) => setReason(event.target.value)} className={`${inputClass} min-h-16`} maxLength={300} placeholder="เหตุผลที่ส่งไม่ครบ (บังคับ)" />
        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}
