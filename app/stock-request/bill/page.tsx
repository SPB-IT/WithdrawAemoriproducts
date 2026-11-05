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

type FormField = 'photo' | 'name' | 'code' | 'stock' | 'staff';

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
  const [deleteStaff, setDeleteStaff] = useState('');
  const [deleteRecent, setDeleteRecent] = useState<string[]>([]);

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
    const timer = setTimeout(() => setFlash(null), 2500);
    return () => clearTimeout(timer);
  }, [flash]);

  const removeItem = async () => {
    if (!deleting) return;
    if (!deleteStaff.trim()) return setDeleteError('กรุณาระบุชื่อผู้ลบรายการ');
    setDeleteBusy(true);
    setDeleteError(null);
    try {
      await apiFetch(`/api/stock-request/branch/items/${deleting.id}`, { method: 'DELETE', json: { staffName: deleteStaff.trim() } });
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

      {flash && (
        <div role="status" aria-live="polite" className="pointer-events-none fixed inset-x-3 top-3 z-[70] mx-auto flex max-w-md items-center gap-2 rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-xl shadow-emerald-200">
          <span className="text-lg">✅</span>
          <span className="min-w-0 flex-1">{flash}</span>
        </div>
      )}
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
                              const recent = bill ? readRecentStaff(bill.branch_id) : [];
                              setDeleteRecent(recent);
                              setDeleteStaff(recent[0] ?? '');
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
                      สั่ง <span className="font-black text-pink-700">{formatNumber(item.stock_on_hand)}</span> ชิ้น
                    </p>
                    {item.staff_note && <p className="mt-1 text-xs text-slate-600">📝 {item.staff_note}</p>}
                    {item.source === 'hq' && item.hq_note && <p className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs font-bold text-amber-800">🏢 {item.hq_note}</p>}
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
        <div className="space-y-2">
          <StaffNameField label="ชื่อผู้ลบรายการ" value={deleteStaff} onChange={setDeleteStaff} recent={deleteRecent} />
          <InlineError message={deleteError} />
        </div>
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
  // ช่องที่กรอกผิด/ลืมกรอก → เลื่อนไปหา + กรอบแดง + ข้อความใต้ช่อง
  const [invalid, setInvalid] = useState<{ field: FormField; message: string } | null>(null);
  const fieldRefs = useRef<Partial<Record<FormField, HTMLElement | null>>>({});
  const formRef = useRef<HTMLFormElement>(null);
  // ใช้ id เดิมเมื่อกดบันทึกซ้ำหลังเน็ตหลุด เพื่อไม่ให้เกิดรายการซ้ำ
  const itemIdRef = useRef<string>('');
  const uploadedRef = useRef<{ blob: Blob; path: string } | null>(null);

  const flagInvalid = (field: FormField, message: string) => {
    setInvalid({ field, message });
    setError(null);
    requestAnimationFrame(() => {
      const el = fieldRefs.current[field];
      el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      const input = el?.matches('input, textarea') ? el : el?.querySelector('input, textarea');
      if (input instanceof HTMLElement) input.focus({ preventScroll: true });
    });
  };
  const fieldClass = (field: FormField) => (invalid?.field === field ? `${inputClass} border-rose-400 ring-4 ring-rose-100` : inputClass);
  const fieldError = (field: FormField) => (invalid?.field === field ? <p className="mt-1 text-xs font-bold text-rose-600">⚠️ {invalid.message}</p> : null);
  // แก้ช่องที่ผิดแล้ว กรอบแดงหายเอง
  const edit = (field: FormField, setter: (value: string) => void) => (value: string) => {
    setter(value);
    if (invalid?.field === field) setInvalid(null);
  };

  const clearItemFields = () => {
    itemIdRef.current = crypto.randomUUID();
    uploadedRef.current = null;
    setPhoto(null);
    setProductName('');
    setProductCode('');
    setStock('');
    setNote('');
    setError(null);
    setInvalid(null);
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
    // "บันทึกแล้วปิด" ตอนฟอร์มยังว่าง (เช่น หลังบันทึกต่อเนื่องไปแล้ว) = ปิดหน้าต่างเลย
    const pristine = !photo && !productName.trim() && !productCode.trim() && stock.trim() === '' && !note.trim();
    if (!keepOpenRef.current && pristine) return onClose();
    if (!photo) return flagInvalid('photo', 'กรุณาถ่ายรูปหรือเลือกรูปสินค้า');
    if (!productName.trim()) return flagInvalid('name', 'กรุณากรอกชื่อสินค้า');
    if (!productCode.trim()) return flagInvalid('code', 'กรุณากรอกรหัสสินค้า');
    if (stock.trim() === '' || !Number.isInteger(stockValue) || stockValue < 1) return flagInvalid('stock', 'กรอกจำนวนที่ต้องการสั่ง (อย่างน้อย 1)');
    if (!staffName.trim()) return flagInvalid('staff', 'กรุณากรอกหรือเลือกชื่อผู้ลงรายการ');

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
      navigator.vibrate?.(60); // มือถือสั่นเบา ๆ ให้รู้ว่าบันทึกแล้ว
      const keepOpen = keepOpenRef.current;
      onSaved(productName.trim(), keepOpen);
      if (keepOpen) {
        // ชื่อผู้ลงรายการคงไว้ ล้างเฉพาะข้อมูลสินค้า
        setLastSaved(productName.trim());
        setSavedCount((count) => count + 1);
        clearItemFields();
        // เลื่อนกลับขึ้นบน (เห็นข้อความบันทึกแล้ว + พร้อมถ่ายรูปถัดไป)
        formRef.current?.closest('.overflow-y-auto')?.scrollTo({ top: 0, behavior: 'smooth' });
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
      <form id="add-item-form" ref={formRef} onSubmit={submit} className="space-y-4" noValidate>
        {lastSaved && (
          <div className="rounded-xl bg-emerald-50 px-3.5 py-2.5 text-sm font-bold text-emerald-700 ring-1 ring-emerald-200">
            ✅ บันทึก “{lastSaved}” แล้ว{savedCount > 1 ? ` (รอบนี้ ${savedCount} รายการ)` : ''} — ถ่ายรูปรายการถัดไปได้เลย
          </div>
        )}
        <div ref={(el) => { fieldRefs.current.photo = el; }} className={invalid?.field === 'photo' ? 'rounded-2xl ring-4 ring-rose-200' : ''}>
          <CameraCapture
            key={entryKey}
            value={photo}
            onChange={(next) => {
              setPhoto(next);
              if (next && invalid?.field === 'photo') setInvalid(null);
            }}
          />
          {fieldError('photo')}
        </div>
        <Field label="ชื่อสินค้า" required>
          <input ref={(el) => { fieldRefs.current.name = el; }} value={productName} onChange={(event) => edit('name', setProductName)(event.target.value)} className={fieldClass('name')} maxLength={200} placeholder="เช่น ถุงหิ้วแอมโมริ (S)" />
          {fieldError('name')}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="รหัสสินค้า" required>
            <input ref={(el) => { fieldRefs.current.code = el; }} value={productCode} onChange={(event) => edit('code', setProductCode)(event.target.value)} className={fieldClass('code')} maxLength={100} placeholder="เช่น SP-3396" autoCapitalize="characters" />
            {fieldError('code')}
          </Field>
          <Field label="จำนวนที่ต้องการสั่ง" required hint="จำนวนชิ้นที่อยากให้สำนักงานใหญ่ส่งมา">
            <input ref={(el) => { fieldRefs.current.stock = el; }} value={stock} onChange={(event) => edit('stock', setStock)(event.target.value.replace(/[^0-9]/g, ''))} className={fieldClass('stock')} inputMode="numeric" placeholder="เช่น 5" />
            {fieldError('stock')}
          </Field>
        </div>
        <Field label="หมายเหตุ (ไม่บังคับ)">
          <textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-20`} maxLength={1000} placeholder="เช่น ลูกค้าถามหาบ่อย" />
        </Field>
        <div ref={(el) => { fieldRefs.current.staff = el; }} className={invalid?.field === 'staff' ? 'rounded-2xl p-1 ring-4 ring-rose-200' : ''}>
          <StaffNameField value={staffName} onChange={edit('staff', setStaffName)} recent={recentStaff} known={knownStaff} />
          {fieldError('staff')}
        </div>
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
  const { branch } = useBranch();
  const [staffName, setStaffName] = useState('');
  const [recentStaff, setRecentStaff] = useState<string[]>([]);
  const knownStaff = useBranchStaffNames(Boolean(item));
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
      const recent = readRecentStaff(branch.id);
      setRecentStaff(recent);
      setStaffName(recent[0] ?? '');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item, branch.id]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!item) return;
    const stockValue = Number(stock);
    if (!productName.trim()) return setError('กรุณากรอกชื่อสินค้า');
    if (!productCode.trim()) return setError('กรุณากรอกรหัสสินค้า');
    if (stock.trim() === '' || !Number.isInteger(stockValue) || stockValue < 1) return setError('จำนวนที่ต้องการสั่งต้องเป็นจำนวนเต็มอย่างน้อย 1');

    if (!staffName.trim()) return setError('กรุณาระบุชื่อผู้แก้ไข');
    setSaving(true);
    setError(null);
    try {
      const photoPath = photo ? await uploadPhoto('/api/stock-request/branch/upload-url', photo) : null;
      await apiFetch(`/api/stock-request/branch/items/${item.id}`, {
        method: 'PATCH',
        json: { productName: productName.trim(), productCode: productCode.trim(), stockOnHand: stockValue, staffNote: note.trim() || null, photoPath, staffName: staffName.trim() },
      });
      saveRecentStaff(branch.id, staffName.trim());
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
            <Field label="จำนวนที่ต้องการสั่ง" required>
              <input value={stock} onChange={(event) => setStock(event.target.value.replace(/[^0-9]/g, ''))} className={inputClass} inputMode="numeric" />
            </Field>
          </div>
          <Field label="หมายเหตุ (ไม่บังคับ)">
            <textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-20`} maxLength={1000} />
          </Field>
          <StaffNameField label="ชื่อผู้แก้ไข" value={staffName} onChange={setStaffName} recent={recentStaff} known={knownStaff} />
          <InlineError message={error} />
          <p className="text-[11px] text-slate-400">ลงรายการโดย {item.reported_by_name} · {formatDateTime(item.created_at)}</p>
        </form>
      )}
    </Modal>
  );
}
