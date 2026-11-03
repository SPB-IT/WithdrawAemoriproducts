'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import BranchShell, { useBranch } from '@/components/stock-request/BranchShell';
import CameraCapture from '@/components/stock-request/CameraCapture';
import StaffNameField, { readRecentStaff, saveRecentStaff, useBranchStaffNames } from '@/components/stock-request/StaffNameField';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  Field,
  InlineError,
  LoadingState,
  Modal,
  PhotoThumb,
  Spinner,
  StatusBadge,
  inputClass,
  primaryButton,
  secondaryButton,
} from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber, uploadPhoto } from '@/lib/stock-request/client';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';

const REFRESH_MS = 30_000;

export default function CurrentBillPage() {
  return (
    <BranchShell>
      <CurrentBill />
    </BranchShell>
  );
}

function CurrentBill() {
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [editing, setEditing] = useState<BillItemDetail | null>(null);
  const [deleting, setDeleting] = useState<BillItemDetail | null>(null);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ bill: BillDetail }>('/api/stock-request/branch/bill');
      setBill(data.bill);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, []);

  useEffect(() => {
    const first = setTimeout(load, 0);
    const timer = setInterval(load, REFRESH_MS);
    return () => {
      clearTimeout(first);
      clearInterval(timer);
    };
  }, [load]);

  useEffect(() => {
    if (!flash) return;
    const timer = setTimeout(() => setFlash(null), 3500);
    return () => clearTimeout(timer);
  }, [flash]);

  const removeItem = async () => {
    if (!deleting) return;
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/stock-request/branch/items/${deleting.id}`, { method: 'DELETE' });
      setFlash(`ลบ “${deleting.product_name}” แล้ว`);
      setDeleting(null);
      void load();
    } catch (err) {
      setDeleteError(errorMessage(err));
    } finally {
      setDeleteBusy(false);
    }
  };

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState label="กำลังโหลดบิลปัจจุบัน..." />;

  return (
    <div className="space-y-4">
      <section className="rounded-3xl border border-pink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">บิลที่เปิดอยู่</p>
            <p className="font-mono text-lg font-black text-slate-800">{bill.bill_no}</p>
            <p className="text-xs text-slate-400">เปิดเมื่อ {formatDateTime(bill.created_at)}</p>
          </div>
          <StatusBadge status={bill.status} />
        </div>
        <p className="mt-3 rounded-xl bg-pink-50 px-3 py-2 text-xs text-pink-700">
          เพิ่มสินค้าที่ใกล้หมดเข้าบิลนี้ได้เรื่อย ๆ ระบบบันทึกทันทีทุกครั้ง ไม่ต้องกดส่ง — ลงผิดแก้ไขหรือลบได้จนกว่าสำนักงานใหญ่จะตัดบิล
        </p>
        <button type="button" onClick={() => setAdding(true)} className={`${primaryButton} mt-4 w-full py-3.5 text-base`}>
          📸 เพิ่มสินค้าใกล้หมด
        </button>
      </section>

      {flash && <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">✅ {flash}</div>}
      {error && <InlineError message={`อัปเดตข้อมูลล่าสุดไม่สำเร็จ: ${error}`} />}

      <section>
        <div className="mb-2 flex items-center justify-between">
          <h2 className="text-sm font-black text-slate-700">รายการในบิล ({bill.items.length})</h2>
          <button type="button" onClick={load} className="text-xs font-bold text-pink-600 hover:underline">
            รีเฟรช
          </button>
        </div>
        {bill.items.length === 0 ? (
          <EmptyState icon="🧺" title="ยังไม่มีรายการในบิลนี้" description="กด “เพิ่มสินค้าใกล้หมด” เพื่อถ่ายรูปและบันทึกรายการแรก" />
        ) : (
          <ul className="space-y-2.5">
            {bill.items
              .slice()
              .reverse()
              .map((item) => (
                <li key={item.id} className="flex gap-3 rounded-2xl border border-slate-100 bg-white p-3 shadow-sm">
                  <PhotoThumb url={item.photo_url} alt={item.product_name} />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-bold text-slate-800">{item.product_name}</p>
                      {item.source === 'branch' && (
                        <div className="flex shrink-0 gap-1">
                          <button type="button" onClick={() => setEditing(item)} className="rounded-lg bg-pink-50 px-2.5 py-1 text-xs font-bold text-pink-600 ring-1 ring-pink-100 hover:bg-pink-100">
                            ✏️ แก้ไข
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setDeleteError(null);
                              setDeleting(item);
                            }}
                            className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-600 ring-1 ring-rose-100 hover:bg-rose-100"
                          >
                            🗑️ ลบ
                          </button>
                        </div>
                      )}
                    </div>
                    <p className="text-xs text-slate-500">รหัส {item.product_code}</p>
                    <p className="mt-1 text-sm">
                      คงเหลือหน้าร้าน <span className="font-black text-pink-700">{formatNumber(item.stock_on_hand)}</span>
                    </p>
                    {item.staff_note && <p className="mt-1 text-xs text-slate-600">📝 {item.staff_note}</p>}
                    <p className="mt-1 text-[11px] text-slate-400">
                      {item.source === 'hq' ? 'สำนักงานใหญ่เพิ่ม' : `โดย ${item.reported_by_name}`} · {formatDateTime(item.created_at)}
                    </p>
                  </div>
                </li>
              ))}
          </ul>
        )}
      </section>

      <EditItemModal
        item={editing}
        onClose={() => setEditing(null)}
        onSaved={(name) => {
          setEditing(null);
          setFlash(`แก้ไข “${name}” แล้ว`);
          void load();
        }}
      />

      <ConfirmDialog
        open={Boolean(deleting)}
        title="ลบรายการนี้?"
        tone="danger"
        confirmLabel="ลบรายการ"
        busy={deleteBusy}
        onCancel={() => setDeleting(null)}
        onConfirm={removeItem}
        message={
          <>
            ลบ <span className="font-bold">{deleting?.product_name}</span> ({deleting?.product_code}) ออกจากบิล รวมถึงรูปสินค้า
          </>
        }
      >
        <InlineError message={deleteError} />
      </ConfirmDialog>

      <AddItemModal
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(name, keepOpen) => {
          if (!keepOpen) setAdding(false);
          setFlash(`บันทึก “${name}” แล้ว`);
          void load();
        }}
      />
    </div>
  );
}

function AddItemModal({ open, onClose, onSaved }: { open: boolean; onClose: () => void; onSaved: (name: string, keepOpen: boolean) => void }) {
  const { branch } = useBranch();
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [productName, setProductName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [stock, setStock] = useState('');
  const [note, setNote] = useState('');
  const [staffName, setStaffName] = useState('');
  const [recentStaff, setRecentStaff] = useState<string[]>([]);
  const knownStaff = useBranchStaffNames(open);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // บันทึกต่อเนื่อง: ถ่ายรูปรายการถัดไปได้ทันทีโดยไม่ต้องปิด/เปิดฟอร์มใหม่
  const [lastSaved, setLastSaved] = useState<string | null>(null);
  const [savedCount, setSavedCount] = useState(0);
  const [entryKey, setEntryKey] = useState(0); // เปลี่ยนเพื่อรีเซ็ตกล้องเมื่อเริ่มรายการใหม่
  const keepOpenRef = useRef(false);
  // ใช้ id เดิมเมื่อกดบันทึกซ้ำหลังเน็ตหลุด เพื่อไม่ให้เกิดรายการซ้ำ
  const itemIdRef = useRef<string>('');
  const uploadedRef = useRef<{ blob: Blob; path: string } | null>(null);

  const clearItemFields = () => {
    itemIdRef.current = crypto.randomUUID();
    uploadedRef.current = null;
    setPhoto(null);
    setProductName('');
    setProductCode('');
    setStock('');
    setNote('');
    setError(null);
    setEntryKey((key) => key + 1);
  };

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      clearItemFields();
      setLastSaved(null);
      setSavedCount(0);
      // เติมชื่อล่าสุดที่ใช้ในเครื่องนี้ไว้ให้ ลงหลายรายการติดกันไม่ต้องพิมพ์ใหม่ (เปลี่ยนคนก็แก้ได้)
      const recent = readRecentStaff(branch.id);
      setRecentStaff(recent);
      setStaffName(recent[0] ?? '');
    }, 0);
    return () => clearTimeout(timer);
  }, [open, branch.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const stockValue = Number(stock);
    if (!photo) return setError('กรุณาถ่ายรูปหรือเลือกรูปสินค้า');
    if (!productName.trim()) return setError('กรุณากรอกชื่อสินค้า');
    if (!productCode.trim()) return setError('กรุณากรอกรหัสสินค้า');
    if (stock.trim() === '' || !Number.isInteger(stockValue) || stockValue < 0) return setError('จำนวนคงเหลือต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');
    if (!staffName.trim()) return setError('กรุณากรอกชื่อผู้ลงรายการ');

    setSaving(true);
    setError(null);
    try {
      let photoPath = uploadedRef.current?.blob === photo ? uploadedRef.current.path : null;
      if (!photoPath) {
        photoPath = await uploadPhoto('/api/stock-request/branch/upload-url', photo);
        uploadedRef.current = { blob: photo, path: photoPath };
      }
      await apiFetch('/api/stock-request/branch/items', {
        method: 'POST',
        json: {
          itemId: itemIdRef.current,
          productName: productName.trim(),
          productCode: productCode.trim(),
          stockOnHand: stockValue,
          staffNote: note.trim() || null,
          photoPath,
          staffName: staffName.trim(),
        },
      });
      saveRecentStaff(branch.id, staffName.trim());
      const keepOpen = keepOpenRef.current;
      onSaved(productName.trim(), keepOpen);
      if (keepOpen) {
        // ชื่อผู้ลงรายการคงไว้ ล้างเฉพาะข้อมูลสินค้า
        setLastSaved(productName.trim());
        setSavedCount((count) => count + 1);
        clearItemFields();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={saving ? () => undefined : onClose}
      title="เพิ่มสินค้าใกล้หมด"
      footer={
        <div className="space-y-2">
          <button type="submit" form="add-item-form" disabled={saving} onClick={() => (keepOpenRef.current = true)} className={`${primaryButton} w-full py-3`}>
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'กำลังบันทึก...' : '💾 บันทึก แล้วเพิ่มรายการต่อ'}
          </button>
          <div className="grid grid-cols-2 gap-2">
            <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
              {savedCount > 0 ? 'เสร็จแล้ว' : 'ยกเลิก'}
            </button>
            <button type="submit" form="add-item-form" disabled={saving} onClick={() => (keepOpenRef.current = false)} className={`${secondaryButton} text-pink-600 ring-pink-200`}>
              บันทึกแล้วปิด
            </button>
          </div>
        </div>
      }
    >
      <form id="add-item-form" onSubmit={submit} className="space-y-4">
        {lastSaved && (
          <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
            ✅ บันทึก “{lastSaved}” แล้ว{savedCount > 1 ? ` (รอบนี้ ${savedCount} รายการ)` : ''} — ถ่ายรูปรายการถัดไปได้เลย
          </div>
        )}
        <CameraCapture key={entryKey} value={photo} onChange={setPhoto} />
        <Field label="ชื่อสินค้า" required>
          <input value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClass} maxLength={200} placeholder="เช่น ถุงหิ้วแอมโมริ (S)" />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="รหัสสินค้า" required>
            <input value={productCode} onChange={(event) => setProductCode(event.target.value)} className={inputClass} maxLength={100} placeholder="เช่น SP-3396" autoCapitalize="characters" />
          </Field>
          <Field label="คงเหลือหน้าร้าน" required hint="จำนวนที่เหลือจริงตอนนี้">
            <input value={stock} onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ''))} className={inputClass} inputMode="numeric" placeholder="0" />
          </Field>
        </div>
        <Field label="หมายเหตุ (ไม่บังคับ)">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-20`} maxLength={1000} placeholder="เช่น ลูกค้าถามหาบ่อย" />
        </Field>
        <StaffNameField value={staffName} onChange={setStaffName} recent={recentStaff} known={knownStaff} />
        <InlineError message={error} />
        <p className="text-[11px] text-slate-400">ระบบบันทึกชื่อและวันเวลาที่ลงรายการอัตโนมัติ · ลงผิดแก้ไขหรือลบได้จนกว่าสำนักงานใหญ่จะตัดบิล</p>
      </form>
    </Modal>
  );
}

// แก้ไขรายการที่ลงผิด (ก่อนตัดบิล) — เปลี่ยนรูปได้ ถ้าไม่ถ่ายใหม่จะใช้รูปเดิม
function EditItemModal({ item, onClose, onSaved }: { item: BillItemDetail | null; onClose: () => void; onSaved: (name: string) => void }) {
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [productName, setProductName] = useState('');
  const [productCode, setProductCode] = useState('');
  const [stock, setStock] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      setPhoto(null);
      setProductName(item.product_name);
      setProductCode(item.product_code);
      setStock(item.stock_on_hand === null ? '' : String(item.stock_on_hand));
      setNote(item.staff_note ?? '');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    const stockValue = Number(stock);
    if (!productName.trim()) return setError('กรุณากรอกชื่อสินค้า');
    if (!productCode.trim()) return setError('กรุณากรอกรหัสสินค้า');
    if (stock.trim() === '' || !Number.isInteger(stockValue) || stockValue < 0) return setError('จำนวนคงเหลือต้องเป็นจำนวนเต็มตั้งแต่ 0 ขึ้นไป');

    setSaving(true);
    setError(null);
    try {
      const photoPath = photo ? await uploadPhoto('/api/stock-request/branch/upload-url', photo) : null;
      await apiFetch(`/api/stock-request/branch/items/${item.id}`, {
        method: 'PATCH',
        json: { productName: productName.trim(), productCode: productCode.trim(), stockOnHand: stockValue, staffNote: note.trim() || null, photoPath },
      });
      onSaved(productName.trim());
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      open={Boolean(item)}
      onClose={saving ? () => undefined : onClose}
      title="แก้ไขรายการ"
      footer={
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={onClose} disabled={saving} className={secondaryButton}>
            ยกเลิก
          </button>
          <button type="submit" form="edit-item-form" disabled={saving} className={primaryButton}>
            {saving && <Spinner className="h-4 w-4" />}
            {saving ? 'กำลังบันทึก...' : 'บันทึกการแก้ไข'}
          </button>
        </div>
      }
    >
      {item && (
        <form id="edit-item-form" onSubmit={submit} className="space-y-4">
          {!photo && (
            <div className="flex items-center gap-3 rounded-xl bg-pink-50/60 p-3 ring-1 ring-pink-100">
              <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-16 w-16" />
              <p className="text-xs font-semibold text-slate-600">รูปปัจจุบัน — ถ้าต้องการเปลี่ยน ถ่ายหรือเลือกรูปใหม่ด้านล่าง</p>
            </div>
          )}
          <CameraCapture key={item.id} value={photo} onChange={setPhoto} />
          <Field label="ชื่อสินค้า" required>
            <input value={productName} onChange={(event) => setProductName(event.target.value)} className={inputClass} maxLength={200} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="รหัสสินค้า" required>
              <input value={productCode} onChange={(event) => setProductCode(event.target.value)} className={inputClass} maxLength={100} autoCapitalize="characters" />
            </Field>
            <Field label="คงเหลือหน้าร้าน" required>
              <input value={stock} onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ''))} className={inputClass} inputMode="numeric" />
            </Field>
          </div>
          <Field label="หมายเหตุ (ไม่บังคับ)">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-20`} maxLength={1000} />
          </Field>
          <InlineError message={error} />
          <p className="text-[11px] text-slate-400">ลงรายการโดย {item.reported_by_name} · {formatDateTime(item.created_at)}</p>
        </form>
      )}
    </Modal>
  );
}
