'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { AuditList, IssueBanner, QtyLine, StatusTimeline, SubstitutionPair, packingProgress } from '@/components/stock-request/BillParts';
import CameraCapture from '@/components/stock-request/CameraCapture';
import PickLinkButton from '@/components/stock-request/PickLinkButton';
import { isPartial, shortQty, shortfallHandled } from '@/lib/stock-request/qty';
import ShipDialog from '@/components/stock-request/ShipDialog';
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
import { ClientApiError, apiFetch, errorMessage, formatDateTime, formatNumber, uploadPhoto } from '@/lib/stock-request/client';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';

type Dialog =
  | { kind: 'add' }
  | { kind: 'edit'; item: BillItemDetail }
  | { kind: 'sub'; item: BillItemDetail }
  | { kind: 'clear-sub'; item: BillItemDetail }
  | { kind: 'remove'; item: BillItemDetail; removed: boolean }
  | { kind: 'ship' }
  | null;

export default function HqBillDetailPage() {
  const { billId } = useParams<{ billId: string }>();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'ok' | 'warn'; text: string } | null>(null);
  const [dialog, setDialog] = useState<Dialog>(null);
  const [resolving, setResolving] = useState(false);
  const [exporting, setExporting] = useState<'excel' | 'pdf' | 'sheet' | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ bill: BillDetail }>(`/admin/stock-request/api/bills/${billId}`);
      setBill(data.bill);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [billId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  /** เรียก API ที่แก้ไขบิล — ถ้าเวอร์ชันชนกัน (มีคนแก้ก่อน) จะโหลดข้อมูลใหม่ให้อัตโนมัติ */
  const mutate = useCallback(
    async (url: string, method: string, json: Record<string, unknown>, success: string) => {
      if (!bill) return;
      try {
        await apiFetch(url, { method, json: { ...json, expectedVersion: bill.version } });
        setNotice({ tone: 'ok', text: success });
        setDialog(null);
        await load();
      } catch (err) {
        if (err instanceof ClientApiError && err.code === 'SR_VERSION_CONFLICT') {
          setDialog(null);
          setNotice({ tone: 'warn', text: 'บิลนี้มีการเปลี่ยนแปลงล่าสุด (สาขาเพิ่มรายการหรือผู้ดูแลอื่นแก้ไข) ระบบโหลดข้อมูลใหม่แล้ว กรุณาตรวจอีกครั้ง' });
          await load();
          return;
        }
        throw err;
      }
    },
    [bill, load],
  );

  const runExport = async (kind: 'excel' | 'pdf' | 'sheet') => {
    if (!bill) return;
    // เปิดแท็บไว้ก่อนทันทีที่กด (ก่อน await) ไม่ให้เบราว์เซอร์บล็อก popup
    const target = kind === 'sheet' ? window.open('', '_blank') : null;
    setExporting(kind);
    try {
      const name = `${bill.bill_no}-${bill.branch_name}`;
      if (kind === 'sheet') {
        const { openPickingSheetPdf } = await import('@/components/stock-request/BillPdf');
        await openPickingSheetPdf(bill, target);
      } else if (kind === 'excel') {
        const { exportBillsExcel } = await import('@/lib/stock-request/export-excel');
        await exportBillsExcel([bill], name);
      } else {
        const { exportBillsPdf } = await import('@/components/stock-request/BillPdf');
        await exportBillsPdf([bill], name);
      }
    } catch (err) {
      target?.close();
      setNotice({ tone: 'warn', text: `ส่งออกไม่สำเร็จ: ${errorMessage(err)}` });
    } finally {
      setExporting(null);
    }
  };

  const itemNames = useMemo(() => new Map((bill?.items ?? []).map((item) => [item.id, item.product_name])), [bill]);

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState />;

  const active = bill.items.filter((item) => !item.is_removed);
  const removed = bill.items.filter((item) => item.is_removed);
  const afterBilling = bill.status !== 'pending';

  return (
    <div className="space-y-5">
      <Link href="/admin/stock-request/bills" className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← บิลทุกสาขา
      </Link>

      <section className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-bold text-pink-600">{bill.branch_name}</p>
            <h1 className="font-mono text-2xl font-black">{bill.bill_no}</h1>
            <p className="text-xs text-slate-500">
              สร้างเมื่อ {formatDateTime(bill.created_at)} · {active.length} รายการ
            </p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <StatusBadge status={bill.status} />
            <div className="flex flex-wrap justify-end gap-2">
              {bill.status === 'pending' && (
                <Link href={`/admin/stock-request/bills/${bill.id}/review`} className={`${primaryButton} ${active.length === 0 ? 'pointer-events-none opacity-50' : ''}`}>
                  ✂️ ตรวจและตัดบิล
                </Link>
              )}
              {bill.status === 'billed' && (
                <Link href={`/admin/stock-request/bills/${bill.id}/pick`} className={secondaryButton}>
                  📦 แพ็คของ
                </Link>
              )}
              {bill.status === 'billed' && <PickLinkButton billId={bill.id} billNo={bill.bill_no} branchName={bill.branch_name} />}
              {bill.status === 'billed' && (
                // ส่งได้เมื่อแพ็คของเสร็จ (เช็คครบทุกรายการ) เท่านั้น
                <button
                  type="button"
                  onClick={() => setDialog({ kind: 'ship' })}
                  disabled={!packingProgress(bill).done}
                  title={packingProgress(bill).done ? undefined : 'ต้องแพ็คของให้ครบก่อน'}
                  className={`${primaryButton}`}
                >
                  🚚 จัดส่ง
                </button>
              )}
              <button type="button" className={secondaryButton} disabled={exporting !== null} onClick={() => runExport('sheet')}>
                {exporting === 'sheet' ? <Spinner className="h-4 w-4" /> : '🧾'} ใบจัดสินค้า A4
              </button>
              <button type="button" className={secondaryButton} disabled={exporting !== null} onClick={() => runExport('excel')}>
                {exporting === 'excel' ? <Spinner className="h-4 w-4" /> : '📗'} Excel
              </button>
              <button type="button" className={secondaryButton} disabled={exporting !== null} onClick={() => runExport('pdf')}>
                {exporting === 'pdf' ? <Spinner className="h-4 w-4" /> : '📕'} PDF
              </button>
            </div>
          </div>
        </div>
        <div className="mt-5">
          <StatusTimeline bill={bill} />
        </div>
        {bill.issue_status && (
          <div className="mt-4">
            <IssueBanner bill={bill} onResolve={() => setResolving(true)} />
          </div>
        )}
        {afterBilling && (
          <p className="mt-4 rounded-xl bg-amber-50 px-3.5 py-2.5 text-xs font-semibold text-amber-800 ring-1 ring-amber-200">
            บิลนี้ตัดแล้ว — การแก้ไขทุกครั้งต้องระบุเหตุผลและถูกบันทึกในประวัติ บิลจะไม่กลับไปเปิดรับรายการจากสาขาอีก
          </p>
        )}
      </section>

      {notice && (
        <div className={`flex items-start justify-between gap-3 rounded-xl px-4 py-3 text-sm font-semibold ring-1 ${notice.tone === 'ok' ? 'bg-emerald-50 text-emerald-700 ring-emerald-200' : 'bg-amber-50 text-amber-800 ring-amber-200'}`}>
          <span>{notice.text}</span>
          <button type="button" onClick={() => setNotice(null)} className="text-xs opacity-60 hover:opacity-100">
            ✕
          </button>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-black">รายการสินค้า</h2>
          <button type="button" onClick={() => setDialog({ kind: 'add' })} className={secondaryButton}>
            ➕ เพิ่มสินค้า
          </button>
        </div>
        {active.length === 0 ? (
          <EmptyState icon="🧺" title="ยังไม่มีรายการในบิลนี้" />
        ) : (
          <ul className="space-y-3">
            {active.map((item, index) => (
              <ItemRow key={item.id} index={index} item={item} bill={bill} onAction={setDialog} onNotice={(text) => setNotice({ tone: 'ok', text })} />
            ))}
          </ul>
        )}
        {removed.length > 0 && (
          <details className="rounded-2xl border border-pink-100 bg-white p-4">
            <summary className="cursor-pointer text-sm font-bold text-slate-500">รายการที่ถูกนำออก ({removed.length})</summary>
            <ul className="mt-3 space-y-2">
              {removed.map((item) => (
                <li key={item.id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-400 line-through">
                    {item.product_name} ({item.product_code})
                  </span>
                  <button type="button" onClick={() => setDialog({ kind: 'remove', item, removed: false })} className="text-xs font-bold text-pink-600 hover:underline">
                    นำกลับ
                  </button>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>

      <section className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <h2 className="mb-3 text-base font-black">ประวัติการแก้ไข (Audit Log)</h2>
        <AuditList logs={bill.audit_logs} itemNames={itemNames} />
      </section>

      <ItemFormModal dialog={dialog} bill={bill} onClose={() => setDialog(null)} mutate={mutate} />
      <SubstitutionModal dialog={dialog} bill={bill} onClose={() => setDialog(null)} mutate={mutate} />
      <ReasonConfirm dialog={dialog} bill={bill} onClose={() => setDialog(null)} mutate={mutate} />
      <ShipDialog
        open={dialog?.kind === 'ship'}
        billNo={bill.bill_no}
        summary={shipSummary(bill)}
        onClose={() => setDialog(null)}
        onShip={(shipperName) => mutate(`/admin/stock-request/api/bills/${bill.id}/ship`, 'POST', { shipperName }, `บิล ${bill.bill_no} เปลี่ยนเป็นจัดส่งแล้ว`)}
      />
      <ResolveIssueDialog
        open={resolving}
        bill={bill}
        onClose={() => setResolving(false)}
        onDone={async () => {
          setResolving(false);
          setNotice({ tone: 'ok', text: 'ปิดเรื่องปัญหาบิลนี้แล้ว — สาขาได้รับแจ้งเตือน' });
          await load();
        }}
      />
    </div>
  );
}

type Mutate = (url: string, method: string, json: Record<string, unknown>, success: string) => Promise<void>;

function ItemRow({ item, index, bill, onAction, onNotice }: { item: BillItemDetail; index: number; bill: BillDetail; onAction: (dialog: Dialog) => void; onNotice: (text: string) => void }) {
  const pending = bill.status === 'pending';

  return (
    <li className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
      <div className="flex flex-col gap-4 md:flex-row">
        <div className="flex flex-1 gap-3">
          <span className="mt-1 w-6 shrink-0 text-center text-xs font-black text-slate-400">{index + 1}</span>
          <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-24 w-24" />
          <div className="min-w-0 flex-1 text-sm">
            <p className="text-base font-bold text-slate-800">{item.product_name}</p>
            <p className="text-xs text-slate-500">รหัส {item.product_code}</p>
            <QtyLine bill={bill} item={item} />
            {!pending && !item.is_removed && isPartial(item) && !shortfallHandled(item) && <ShortfallButton item={item} onDone={onNotice} />}
            {item.staff_note && <p className="mt-1 text-xs text-slate-600">📝 สาขา: {item.staff_note}</p>}
            {item.hq_note && <p className="mt-1 text-xs text-sky-700">💬 HQ: {item.hq_note}</p>}
            {item.picked_at && <p className="mt-1 text-[11px] font-bold text-slate-500">📦 แพ็คแล้ว{item.picked_by ? ` โดย ${item.picked_by}` : ''} · {formatDateTime(item.picked_at)}</p>}
            {item.received_state === 'ok' && <p className="mt-1 text-xs font-bold text-emerald-700">✓ สาขาได้รับแล้ว · {item.received_checked_by}</p>}
            {item.received_state === 'missing' && (
              <p className="mt-1 rounded-lg bg-rose-50 px-2 py-1 text-xs font-bold text-rose-600">
                ✗ สาขาแจ้งไม่ได้รับ/ไม่ครบ: {item.received_note} · {item.received_checked_by}
              </p>
            )}
            <p className="mt-1 text-[11px] text-slate-400">
              {item.source === 'hq' ? `HQ เพิ่มโดย ${item.reported_by_name}` : `ลงรายการโดย ${item.reported_by_name}`} · {formatDateTime(item.created_at)}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-col gap-2 md:w-56">
          {!pending && <p className="text-[11px] text-slate-400">บิลตัดแล้ว แก้ผ่านปุ่ม “แก้ไข” พร้อมเหตุผล</p>}
          <div className="grid grid-cols-3 gap-1.5 text-xs font-bold">
            <button type="button" onClick={() => onAction({ kind: 'edit', item })} className="rounded-lg bg-slate-100 px-2 py-2 text-slate-700 hover:bg-slate-200">
              แก้ไข
            </button>
            <button type="button" onClick={() => onAction({ kind: 'sub', item })} className="rounded-lg bg-pink-50 px-2 py-2 text-pink-700 hover:bg-pink-100">
              ทดแทน
            </button>
            <button type="button" onClick={() => onAction({ kind: 'remove', item, removed: true })} className="rounded-lg bg-rose-50 px-2 py-2 text-rose-600 hover:bg-rose-100">
              ลบ
            </button>
          </div>
          {item.substitution && (
            <button type="button" onClick={() => onAction({ kind: 'clear-sub', item })} className="text-[11px] font-bold text-slate-400 hover:text-rose-600">
              ยกเลิกสินค้าทดแทน
            </button>
          )}
        </div>
      </div>
      <SubstitutionPair item={item} />
      {item.substitution_history.length > 1 && (
        <details className="mt-2 text-xs text-slate-500">
          <summary className="cursor-pointer font-bold">ประวัติสินค้าทดแทน ({item.substitution_history.length})</summary>
          <ul className="mt-1 space-y-1">
            {item.substitution_history.map((sub) => (
              <li key={sub.id} className={sub.is_active ? 'font-bold text-pink-700' : 'line-through'}>
                {sub.product_name} ({sub.product_code}) — {sub.reason} · {sub.created_by_name ?? ''} {formatDateTime(sub.created_at)}
              </li>
            ))}
          </ul>
        </details>
      )}
    </li>
  );
}

function ReasonField({ required, value, onChange }: { required: boolean; value: string; onChange: (value: string) => void }) {
  return (
    <Field label={required ? 'เหตุผลในการแก้ไข' : 'เหตุผล / หมายเหตุ (ไม่บังคับ)'} required={required} hint={required ? 'บิลตัดแล้ว ต้องระบุเหตุผลทุกครั้ง จะแสดงให้สาขาเห็นในประวัติ' : undefined}>
      <textarea value={value} onChange={(event) => onChange(event.target.value)} className={`${inputClass} min-h-16`} maxLength={1000} />
    </Field>
  );
}

function ModalFooter({ busy, onClose, label }: { busy: boolean; onClose: () => void; label: string }) {
  return (
    <div className="flex justify-end gap-2">
      <button type="button" onClick={onClose} disabled={busy} className={secondaryButton}>
        ยกเลิก
      </button>
      <button type="submit" form="hq-dialog-form" disabled={busy} className={`${primaryButton}`}>
        {busy && <Spinner className="h-4 w-4" />}
        {label}
      </button>
    </div>
  );
}

function ItemFormModal({ dialog, bill, onClose, mutate }: { dialog: Dialog; bill: BillDetail; onClose: () => void; mutate: Mutate }) {
  const open = dialog?.kind === 'add' || dialog?.kind === 'edit';
  const item = dialog?.kind === 'edit' ? dialog.item : null;
  const [form, setForm] = useState({ name: '', code: '', stock: '', note: '', reason: '' });
  const [photo, setPhoto] = useState<Blob | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const needsReason = bill.status !== 'pending';

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setForm({
        name: item?.product_name ?? '',
        code: item?.product_code ?? '',
        stock: item?.stock_on_hand?.toString() ?? '',
        note: item?.hq_note ?? '',
        reason: '',
      });
      setPhoto(null);
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [open, item]);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!form.name.trim() || !form.code.trim()) return setError('กรุณากรอกชื่อและรหัสสินค้า');
    if (needsReason && !form.reason.trim()) return setError('กรุณาระบุเหตุผลในการแก้ไข');
    const num = (value: string) => (value === '' ? null : Number(value));
    setBusy(true);
    setError(null);
    try {
      if (item) {
        const patch: Record<string, unknown> = {};
        if (form.name.trim() !== item.product_name) patch.productName = form.name.trim();
        if (form.code.trim() !== item.product_code) patch.productCode = form.code.trim();
        if (num(form.stock) !== item.stock_on_hand) patch.stockOnHand = num(form.stock);
        if ((form.note.trim() || null) !== item.hq_note) patch.hqNote = form.note.trim() || null;
        if (Object.keys(patch).length === 0) {
          onClose();
          return;
        }
        await mutate(`/admin/stock-request/api/items/${item.id}`, 'PATCH', { patch, reason: form.reason.trim() || null }, `แก้ไข “${form.name.trim()}” แล้ว`);
      } else {
        const photoPath = photo ? await uploadPhoto('/admin/stock-request/api/upload-url', photo, { billId: bill.id }) : null;
        await mutate(
          `/admin/stock-request/api/bills/${bill.id}/items`,
          'POST',
          { productName: form.name.trim(), productCode: form.code.trim(), stockOnHand: num(form.stock), hqNote: form.note.trim() || null, photoPath, reason: form.reason.trim() || null },
          `เพิ่ม “${form.name.trim()}” แล้ว`,
        );
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const numeric = (value: string) => value.replace(/[^0-9]/g, '');

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title={item ? 'แก้ไขรายการสินค้า' : 'เพิ่มสินค้าเข้าบิล'} footer={<ModalFooter busy={busy} onClose={onClose} label="บันทึก" />}>
      <form id="hq-dialog-form" onSubmit={submit} className="space-y-3">
        {!item && (
          <Field label="รูปสินค้า (ไม่บังคับ)">
            <CameraCapture value={photo} onChange={setPhoto} />
          </Field>
        )}
        <Field label="ชื่อสินค้า" required>
          <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={200} />
        </Field>
        <Field label="รหัสสินค้า" required>
          <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} maxLength={100} />
        </Field>
        <Field label="จำนวนที่สั่ง (ชิ้น)" hint="จำนวนที่สาขาสั่ง แก้เมื่อจำเป็นเท่านั้น">
          <input value={form.stock} onChange={(event) => setForm({ ...form, stock: numeric(event.target.value) })} className={inputClass} inputMode="numeric" />
        </Field>
        <Field label="หมายเหตุ HQ">
          <textarea value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} className={`${inputClass} min-h-16`} maxLength={1000} />
        </Field>
        <ReasonField required={needsReason} value={form.reason} onChange={(reason) => setForm({ ...form, reason })} />
        <InlineError message={error} />
      </form>
    </Modal>
  );
}

function SubstitutionModal({ dialog, bill, onClose, mutate }: { dialog: Dialog; bill: BillDetail; onClose: () => void; mutate: Mutate }) {
  const item = dialog?.kind === 'sub' ? dialog.item : null;
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
      await mutate(
        `/admin/stock-request/api/items/${item.id}/substitution`,
        'POST',
        { productName: form.name.trim(), productCode: form.code.trim(), reason: form.reason.trim(), photoPath },
        `กำหนดสินค้าทดแทนให้ “${item.product_name}” แล้ว`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal open={Boolean(item)} onClose={busy ? () => undefined : onClose} title="กำหนดสินค้าทดแทน" size="lg" footer={<ModalFooter busy={busy} onClose={onClose} label="บันทึกสินค้าทดแทน" />}>
      {item && (
        <form id="hq-dialog-form" onSubmit={submit} className="space-y-4">
          <div className="flex gap-3 rounded-xl bg-slate-50 p-3">
            <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-16 w-16" />
            <div className="text-sm">
              <p className="text-xs font-bold text-slate-400">สินค้าเดิม (เก็บไว้ ไม่ถูกลบ)</p>
              <p className="font-bold">{item.product_name}</p>
              <p className="text-xs text-slate-500">
                รหัส {item.product_code} · สาขาสั่ง {formatNumber(item.stock_on_hand)} ชิ้น
              </p>
            </div>
          </div>
          {item.substitution && <p className="rounded-xl bg-amber-50 px-3 py-2 text-xs text-amber-800">มีสินค้าทดแทนอยู่แล้ว ({item.substitution.product_name}) — รายการใหม่จะแทนที่ และเก็บรายการเดิมไว้ในประวัติ</p>}
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="ชื่อสินค้าทดแทน" required>
              <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} className={inputClass} maxLength={200} />
            </Field>
            <Field label="รหัสสินค้าทดแทน" required>
              <input value={form.code} onChange={(event) => setForm({ ...form, code: event.target.value })} className={inputClass} maxLength={100} />
            </Field>
          </div>
          <Field label="เหตุผลในการเปลี่ยนสินค้า" required>
            <textarea value={form.reason} onChange={(event) => setForm({ ...form, reason: event.target.value })} className={`${inputClass} min-h-16`} maxLength={1000} placeholder="เช่น สินค้าเดิมหมดสต็อก" />
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

function ReasonConfirm({ dialog, bill, onClose, mutate }: { dialog: Dialog; bill: BillDetail; onClose: () => void; mutate: Mutate }) {
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const open = dialog?.kind === 'remove' || dialog?.kind === 'clear-sub';
  const needsReason = bill.status !== 'pending';

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setReason('');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [open, dialog]);

  if (!open || !dialog) return null;

  const config =
    dialog.kind === 'clear-sub'
        ? { title: 'ยกเลิกสินค้าทดแทน', message: `ยกเลิกสินค้าทดแทนของ “${dialog.item.product_name}” (ประวัติยังถูกเก็บไว้)`, label: 'ยกเลิกสินค้าทดแทน', tone: 'danger' as const }
        : dialog.removed
          ? { title: 'ลบรายการสินค้า', message: `นำ “${dialog.item.product_name}” ออกจากบิล (ข้อมูลเดิมยังถูกเก็บในประวัติ นำกลับได้)`, label: 'ลบรายการ', tone: 'danger' as const }
          : { title: 'นำรายการกลับ', message: `นำ “${dialog.item.product_name}” กลับเข้าบิล`, label: 'นำกลับ', tone: 'primary' as const };

  const confirm = async () => {
    if (needsReason && !reason.trim()) {
      setError('กรุณาระบุเหตุผลในการแก้ไข');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (dialog.kind === 'clear-sub') await mutate(`/admin/stock-request/api/items/${dialog.item.id}/substitution`, 'DELETE', { reason: reason.trim() || null }, 'ยกเลิกสินค้าทดแทนแล้ว');
      else await mutate(`/admin/stock-request/api/items/${dialog.item.id}/remove`, 'POST', { removed: dialog.removed, reason: reason.trim() || null }, dialog.removed ? 'ลบรายการแล้ว' : 'นำรายการกลับแล้ว');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog open title={config.title} message={config.message} confirmLabel={config.label} tone={config.tone} busy={busy} onCancel={onClose} onConfirm={confirm}>
      <ReasonField required={needsReason} value={reason} onChange={setReason} />
      <InlineError message={error} />
    </ConfirmDialog>
  );
}

type CarryMode = 'same' | 'substitute' | 'none';
type CarryChoice = { mode: CarryMode; name: string; code: string };

// ปิดเรื่องบิลที่มีปัญหา — เลือกต่อรายการที่ขาด: ยกยอดตัวเดิม / ยกยอดเป็นสินค้าทดแทน / ไม่ยกยอด
// รายการที่ยกยอดจะถูกเพิ่มเข้าบิลที่เปิดอยู่ของสาขาทันที · ต้องระบุชื่อผู้ปิดเรื่อง (แจ้งสาขาอัตโนมัติ)
function ResolveIssueDialog({ open, bill, onClose, onDone }: { open: boolean; bill: BillDetail; onClose: () => void; onDone: () => Promise<void> }) {
  const missing = useMemo(() => bill.items.filter((item) => !item.is_removed && item.received_state === 'missing'), [bill.items]);
  const [choices, setChoices] = useState<Record<string, CarryChoice>>({});
  const [note, setNote] = useState('');
  const [resolver, setResolver] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = ['จัดส่งของที่ขาดแยกแล้ว', 'ตรวจสอบแล้วส่งครบ', 'ยกเลิกรายการที่ขาด'];

  const setChoice = (itemId: string, patch: Partial<CarryChoice>) =>
    setChoices((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { mode: 'same', name: '', code: '' }), ...patch } }));

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setChoices(Object.fromEntries(missing.map((item) => [item.id, { mode: 'same' as CarryMode, name: '', code: '' }])));
      setNote('');
      setError(null);
      try {
        const list = JSON.parse(localStorage.getItem('sr_responsible_names') ?? '[]');
        setResolver(Array.isArray(list) && typeof list[0] === 'string' ? list[0] : '');
      } catch {
        setResolver('');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open, missing]);

  const carry = missing
    .map((item) => ({ item, choice: choices[item.id] ?? { mode: 'same' as CarryMode, name: '', code: '' } }))
    .filter(({ choice }) => choice.mode !== 'none');
  const hasSkipped = missing.length > carry.length;

  const confirm = async () => {
    const badSub = carry.find(({ choice }) => choice.mode === 'substitute' && (!choice.name.trim() || !choice.code.trim()));
    if (badSub) return setError(`กรุณาระบุชื่อและรหัสสินค้าทดแทนของ “${badSub.item.product_name}”`);
    if ((hasSkipped || carry.length === 0) && !note.trim()) return setError('รายการที่ไม่ยกยอด กรุณาระบุวิธีแก้/หมายเหตุ');
    if (!resolver.trim()) return setError('กรุณาระบุชื่อผู้ปิดเรื่อง');
    setBusy(true);
    setError(null);
    try {
      await apiFetch(`/admin/stock-request/api/bills/${bill.id}/resolve-issue`, {
        method: 'POST',
        json: {
          note: note.trim(),
          resolverName: resolver.trim(),
          carry: carry.map(({ item, choice }) => ({ itemId: item.id, mode: choice.mode, productName: choice.name.trim(), productCode: choice.code.trim() })),
        },
      });
      await onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const modes: { value: CarryMode; label: string }[] = [
    { value: 'same', label: '↪ ยกยอดตัวเดิม' },
    { value: 'substitute', label: '🔄 ยกยอดเป็นของทดแทน' },
    { value: 'none', label: '✕ ไม่ยกยอด' },
  ];

  return (
    <ConfirmDialog
      open={open}
      title="แก้ไขปัญหาบิล"
      confirmLabel={carry.length ? `ยกยอด ${carry.length} รายการ และปิดเรื่อง` : 'ปิดเรื่อง'}
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
      message={<>บิล <b className="font-mono">{bill.bill_no}</b> · {bill.branch_name} — รายการที่ยกยอดจะถูกเพิ่มเข้าบิลรอบถัดไปของสาขาทันที</>}
    >
      <div className="space-y-3">
        {missing.length > 0 && (
          <ul className="max-h-[45vh] space-y-2 overflow-y-auto pr-1">
            {missing.map((item) => {
              const choice = choices[item.id] ?? { mode: 'same', name: '', code: '' };
              const expected = item.substitution ?? item;
              return (
                <li key={item.id} className="rounded-xl border border-rose-100 bg-rose-50/50 p-2.5">
                  <p className="text-sm font-bold text-slate-800">
                    {expected.product_name} <span className="font-mono text-xs font-normal text-slate-500">({expected.product_code})</span>
                  </p>
                  <p className="text-xs text-rose-600">✗ {item.received_note}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5" role="radiogroup" aria-label={`วิธีแก้ ${expected.product_name}`}>
                    {modes.map((mode) => (
                      <button
                        key={mode.value}
                        type="button"
                        role="radio"
                        aria-checked={choice.mode === mode.value}
                        onClick={() => setChoice(item.id, { mode: mode.value })}
                        className={`rounded-full px-3 py-1 text-xs font-bold ring-1 transition ${
                          choice.mode === mode.value ? 'bg-pink-600 text-white ring-pink-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-pink-300'
                        }`}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                  {choice.mode === 'substitute' && (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      <input value={choice.name} onChange={(event) => setChoice(item.id, { name: event.target.value })} className={inputClass} maxLength={200} placeholder="ชื่อสินค้าทดแทน *" />
                      <input value={choice.code} onChange={(event) => setChoice(item.id, { code: event.target.value })} className={inputClass} maxLength={100} placeholder="รหัสสินค้าทดแทน *" />
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        <div className="flex flex-wrap gap-1.5">
          {quick.map((text) => (
            <button key={text} type="button" onClick={() => setNote(text)} className="rounded-full bg-pink-50 px-3 py-1 text-xs font-bold text-pink-700 ring-1 ring-pink-100">
              {text}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${inputClass} min-h-16`}
          maxLength={1000}
          placeholder={hasSkipped || carry.length === 0 ? 'วิธีแก้ / หมายเหตุ (บังคับ เพราะมีรายการที่ไม่ยกยอด)' : 'หมายเหตุเพิ่มเติม (ถ้ามี) — สาขาจะเห็นข้อความนี้'}
        />
        <input value={resolver} onChange={(event) => setResolver(event.target.value)} className={inputClass} maxLength={100} placeholder="ชื่อผู้ปิดเรื่อง (บังคับ)" />
        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}

function shipSummary(bill: BillDetail) {
  const packing = packingProgress(bill);
  return `แพ็คของเสร็จ ${packing.picked} รายการ${packing.checkers.length ? ` (แพ็คโดย ${packing.checkers.join(', ')})` : ''}`;
}

type ShortfallMode = 'same' | 'substitute' | 'none';

// ของไม่พอ: แอดมินเลือกจัดการจำนวนที่ขาดทีละรายการ — ยกยอดตัวเดิม / ยกยอดเป็นของแทน / ไม่ยกยอด (ทำได้ครั้งเดียว)
function ShortfallButton({ item, onDone }: { item: BillItemDetail; onDone: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<ShortfallMode>('same');
  const [subName, setSubName] = useState('');
  const [subCode, setSubCode] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const short = shortQty(item);
  const productName = item.substitution?.product_name ?? item.product_name;

  const openDialog = () => {
    setMode('same');
    setSubName('');
    setSubCode('');
    setReason('');
    setError(null);
    setOpen(true);
  };

  const confirm = async () => {
    if (mode === 'substitute' && (!subName.trim() || !subCode.trim())) return setError('กรุณาใส่ชื่อและรหัสสินค้าทดแทน');
    if (mode === 'none' && !reason.trim()) return setError('กรุณาระบุเหตุผลที่ไม่ยกยอด');
    setBusy(true);
    setError(null);
    try {
      const result = await apiFetch<{ carriedTo: string | null; qty: number }>(`/admin/stock-request/api/items/${item.id}/carry-shortfall`, {
        method: 'POST',
        json: { mode, productName: subName.trim(), productCode: subCode.trim(), reason: reason.trim() || null },
      });
      setOpen(false);
      onDone(
        mode === 'none'
          ? `บันทึกแล้ว: ไม่ยกยอด ${productName} ${result.qty} ชิ้น`
          : `ยกยอด ${mode === 'substitute' ? subName.trim() : productName} ${result.qty} ชิ้น ไปบิล ${result.carriedTo} แล้ว`,
      );
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const modes: { value: ShortfallMode; label: string }[] = [
    { value: 'same', label: '↪ ยกยอดตัวเดิม' },
    { value: 'substitute', label: '🔄 ยกยอดเป็นของแทน' },
    { value: 'none', label: '✕ ไม่ยกยอด' },
  ];

  return (
    <>
      <button type="button" onClick={openDialog} className="mt-1.5 rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-black text-amber-800 ring-1 ring-amber-200 hover:bg-amber-200">
        ⚙️ จัดการส่วนที่ขาด ({short} ชิ้น)
      </button>
      <ConfirmDialog
        open={open}
        title="จัดการส่วนที่ขาด"
        confirmLabel={mode === 'none' ? 'บันทึก ไม่ยกยอด' : `ยกยอด ${short} ชิ้น`}
        tone={mode === 'none' ? 'danger' : 'primary'}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        message={
          <>
            <b>{productName}</b> ส่งได้ {item.hq_ship_qty}/{item.stock_on_hand} ชิ้น · ขาด <b>{short} ชิ้น</b> — เลือกวิธีจัดการ (ทำได้ครั้งเดียว สาขาได้รับแจ้ง)
          </>
        }
      >
        <div className="space-y-2.5">
          <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="วิธีจัดการส่วนที่ขาด">
            {modes.map((option) => (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={mode === option.value}
                onClick={() => setMode(option.value)}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${mode === option.value ? 'bg-pink-600 text-white ring-pink-600' : 'bg-white text-slate-600 ring-slate-200 hover:ring-pink-300'}`}
              >
                {option.label}
              </button>
            ))}
          </div>
          {mode === 'same' && <p className="text-xs text-slate-500">เพิ่ม {productName} จำนวน {short} ชิ้นเข้าบิลรอบถัดไปของสาขาทันที</p>}
          {mode === 'substitute' && (
            <div className="grid gap-2 sm:grid-cols-2">
              <input value={subName} onChange={(event) => setSubName(event.target.value)} className={inputClass} maxLength={200} placeholder="ชื่อสินค้าทดแทน *" />
              <input value={subCode} onChange={(event) => setSubCode(event.target.value)} className={inputClass} maxLength={100} placeholder="รหัสสินค้าทดแทน *" />
            </div>
          )}
          <textarea
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            className={`${inputClass} min-h-16`}
            maxLength={300}
            placeholder={mode === 'none' ? 'เหตุผลที่ไม่ยกยอด (บังคับ) เช่น สินค้าเลิกผลิต' : 'หมายเหตุ (ไม่บังคับ) — สาขาจะเห็นในบิลถัดไป'}
          />
          <InlineError message={error} />
        </div>
      </ConfirmDialog>
    </>
  );
}
