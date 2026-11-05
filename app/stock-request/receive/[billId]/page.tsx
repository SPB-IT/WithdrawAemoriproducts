'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { IssueBadge, IssueBanner, QtyLine, RemovedItems } from '@/components/stock-request/BillParts';
import BranchShell, { useBranch } from '@/components/stock-request/BranchShell';
import StaffNameField, { readRecentStaff, saveRecentStaff, useBranchStaffNames } from '@/components/stock-request/StaffNameField';
import { ConfirmDialog, ErrorState, InlineError, LoadingState, PhotoThumb, Spinner, StatusBadge, inputClass, primaryButton, secondaryButton } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import type { BillDetail, BillItemDetail } from '@/lib/stock-request/types';

export default function ReceiveCheckPage() {
  return (
    <BranchShell>
      <ReceiveCheck />
    </BranchShell>
  );
}

// เช็คของที่ได้รับ (สาขา): ติ๊กทีละรายการว่าได้รับ / ไม่ได้รับ (ต้องมีหมายเหตุ) → ยืนยันรับ · ส่งออก PDF เป็นหลักฐาน
function ReceiveCheck() {
  const { billId } = useParams<{ billId: string }>();
  const { branch } = useBranch();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [staffName, setStaffName] = useState('');
  const [recentStaff, setRecentStaff] = useState<string[]>([]);
  const knownStaff = useBranchStaffNames(true);
  const [nameMissing, setNameMissing] = useState(false);
  const nameRef = useRef<HTMLDivElement>(null);
  const [missingFor, setMissingFor] = useState<BillItemDetail | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [receiving, setReceiving] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setBill((await apiFetch<{ bill: BillDetail }>(`/api/stock-request/branch/bills/${billId}`)).bill);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [billId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      const recent = readRecentStaff(branch.id);
      setRecentStaff(recent);
      setStaffName(recent[0] ?? '');
    }, 0);
    return () => clearTimeout(timer);
  }, [load, branch.id]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 2500);
    return () => clearTimeout(timer);
  }, [notice]);

  /** ต้องลงชื่อผู้เช็คก่อน — ถ้ายังไม่ใส่ เลื่อนไปที่ช่องชื่อ */
  const requireName = () => {
    const name = staffName.trim();
    if (name) return name;
    setNameMissing(true);
    nameRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    nameRef.current?.querySelector('input')?.focus({ preventScroll: true });
    return null;
  };

  const setState = async (item: BillItemDetail, state: 'ok' | 'missing' | null, note?: string) => {
    const name = state ? requireName() : staffName.trim();
    if (state && !name) return;
    setBusyId(item.id);
    setActionError(null);
    try {
      await apiFetch(`/api/stock-request/branch/items/${item.id}/receive-check`, { method: 'POST', json: { state, note: note ?? null, staffName: name } });
      if (name) saveRecentStaff(branch.id, name);
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
    } finally {
      setBusyId(null);
    }
  };

  const receive = async () => {
    if (!bill) return;
    const name = requireName();
    if (!name) {
      setConfirming(false);
      return;
    }
    setReceiving(true);
    setActionError(null);
    try {
      await apiFetch(`/api/stock-request/branch/bills/${bill.id}/receive`, { method: 'POST', json: { staffName: name } });
      saveRecentStaff(branch.id, name);
      setConfirming(false);
      setNotice('ยืนยันรับสินค้าแล้ว');
      await load();
    } catch (err) {
      setActionError(errorMessage(err));
      setConfirming(false);
    } finally {
      setReceiving(false);
    }
  };

  const exportPdf = async () => {
    if (!bill) return;
    const target = window.open('', '_blank'); // เปิดแท็บก่อน await กัน popup blocker
    setExporting(true);
    try {
      const { openBillPdf } = await import('@/components/stock-request/BillPdf');
      await openBillPdf(bill, target);
    } catch (err) {
      target?.close();
      setActionError(`ส่งออก PDF ไม่สำเร็จ: ${errorMessage(err)}`);
    } finally {
      setExporting(false);
    }
  };

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState label="กำลังโหลดบิล..." />;

  const items = bill.items.filter((item) => !item.is_removed);
  const checked = items.filter((item) => item.received_state).length;
  const missing = items.filter((item) => item.received_state === 'missing').length;
  const checkable = bill.status === 'shipped';

  return (
    <div className="space-y-4 pb-24">
      <Link href="/stock-request/history" className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← ติดตามสถานะ
      </Link>

      <section className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-slate-500">เช็คของที่ได้รับ</p>
            <p className="font-mono text-lg font-black">{bill.bill_no}</p>
            <p className="text-[11px] text-slate-400">จัดส่ง {formatDateTime(bill.shipped_at)}</p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <StatusBadge status={bill.status} />
            <IssueBadge bill={bill} />
          </div>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="h-3 flex-1 overflow-hidden rounded-full bg-slate-100">
            <div className={`h-full rounded-full transition-all ${missing ? 'bg-amber-400' : 'bg-emerald-500'}`} style={{ width: `${items.length ? (checked / items.length) * 100 : 0}%` }} />
          </div>
          <span className="text-sm font-black text-slate-600">
            {checked}/{items.length}
          </span>
        </div>
        {missing > 0 && <p className="mt-2 text-xs font-bold text-rose-600">ไม่ได้รับ/ไม่ครบ {missing} รายการ — สำนักงานใหญ่จะได้รับแจ้งเมื่อกดยืนยันรับ</p>}
        <button type="button" onClick={exportPdf} disabled={exporting} className={`${secondaryButton} mt-3 w-full`}>
          {exporting ? <Spinner className="h-4 w-4" /> : '📄'} ส่งออก PDF (ใช้เป็นหลักฐาน)
        </button>
      </section>

      {checkable && (
        <div ref={nameRef} className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ${nameMissing ? 'ring-4 ring-rose-200' : 'ring-pink-100'}`}>
          <StaffNameField
            label="ผู้เช็คของ"
            value={staffName}
            onChange={(value) => {
              setStaffName(value);
              if (value.trim()) setNameMissing(false);
            }}
            recent={recentStaff}
            known={knownStaff}
          />
          {nameMissing && <p className="mt-1 text-xs font-bold text-rose-600">⚠️ ลงชื่อผู้เช็คของก่อน</p>}
        </div>
      )}
      <IssueBanner bill={bill} />
      {bill.status === 'billed' && <p className="rounded-xl bg-slate-100 px-4 py-3 text-sm font-bold text-slate-600">สำนักงานใหญ่กำลังแพ็คของ — เช็คของได้เมื่อจัดส่งแล้ว</p>}
      <InlineError message={actionError} />

      <ul className="space-y-3">
        {items.map((item) => {
          const sub = item.substitution;
          const state = item.received_state;
          return (
            <li key={item.id} className={`rounded-2xl border-2 bg-white p-3 shadow-sm ${state === 'ok' ? 'border-emerald-300 bg-emerald-50/50' : state === 'missing' ? 'border-rose-300 bg-rose-50/50' : 'border-pink-100'}`}>
              <div className="flex gap-3">
                <PhotoThumb url={sub?.photo_url ?? item.photo_url} alt={sub?.product_name ?? item.product_name} className="h-20 w-20" />
                <div className="min-w-0 flex-1 text-sm">
                  {sub && <span className="inline-block rounded-md bg-amber-100 px-1.5 py-0.5 text-[10px] font-black text-amber-800">สินค้าทดแทน</span>}
                  <p className="font-black text-slate-800">{sub ? sub.product_name : item.product_name}</p>
                  <p className="text-xs text-slate-500">รหัส {sub ? sub.product_code : item.product_code}</p>
                  <QtyLine bill={bill} item={item} />
                  {sub && (
                    <p className="text-[11px] text-slate-400">
                      แทน {item.product_name} · {sub.reason}
                    </p>
                  )}
                  {state === 'ok' && <p className="mt-1 text-xs font-bold text-emerald-700">✓ ได้รับแล้ว · {item.received_checked_by}</p>}
                  {state === 'missing' && (
                    <p className="mt-1 text-xs font-bold text-rose-600">
                      ✗ ไม่ได้รับ/ไม่ครบ: {item.received_note} · {item.received_checked_by}
                    </p>
                  )}
                </div>
              </div>
              {checkable && (
                <div className="mt-2 grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => setState(item, state === 'ok' ? null : 'ok')}
                    className={`rounded-xl py-2.5 text-sm font-black ring-1 transition ${state === 'ok' ? 'bg-emerald-500 text-white ring-emerald-500' : 'bg-emerald-50 text-emerald-700 ring-emerald-100'}`}
                  >
                    {busyId === item.id ? <Spinner className="mx-auto h-4 w-4" /> : '✓ ได้รับ'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => (state === 'missing' ? setState(item, null) : requireName() && setMissingFor(item))}
                    className={`rounded-xl py-2.5 text-sm font-black ring-1 transition ${state === 'missing' ? 'bg-rose-500 text-white ring-rose-500' : 'bg-rose-50 text-rose-600 ring-rose-100'}`}
                  >
                    ✗ ไม่ได้รับ/ไม่ครบ
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <RemovedItems bill={bill} />

      {checkable && (
        <div className="fixed inset-x-0 bottom-0 z-30 border-t border-pink-100 bg-white/95 p-3 backdrop-blur">
          <div className="mx-auto max-w-3xl">
            <button type="button" onClick={() => setConfirming(true)} className={`${primaryButton} w-full bg-none bg-emerald-500 py-3.5 text-base shadow-emerald-200 hover:bg-emerald-600`}>
              📦 ยืนยันรับสินค้า ({checked}/{items.length})
            </button>
          </div>
        </div>
      )}

      {notice && (
        <div role="status" className="pointer-events-none fixed inset-x-3 top-3 z-[70] mx-auto max-w-md rounded-2xl bg-emerald-600 px-4 py-3 text-sm font-black text-white shadow-xl">
          ✅ {notice}
        </div>
      )}

      <MissingDialog
        item={missingFor}
        onClose={() => setMissingFor(null)}
        onConfirm={async (note) => {
          if (!missingFor) return;
          await setState(missingFor, 'missing', note);
          setMissingFor(null);
        }}
      />

      <ConfirmDialog
        open={confirming}
        title="ยืนยันรับสินค้า"
        confirmLabel="ยืนยันรับ"
        busy={receiving}
        onCancel={() => setConfirming(false)}
        onConfirm={receive}
        message={
          <>
            {checked < items.length && (
              <span className="mb-2 block rounded-lg bg-amber-50 px-3 py-2 font-bold text-amber-800">ยังไม่ได้เช็ค {items.length - checked} รายการ — ยืนยันรับเลยหรือไม่?</span>
            )}
            {missing > 0 && <span className="mb-2 block font-bold text-rose-600">มีรายการที่ไม่ได้รับ/ไม่ครบ {missing} รายการ — ระบบจะแจ้งสำนักงานใหญ่</span>}
            บันทึกชื่อ <b>{staffName.trim() || '-'}</b> และเวลาปัจจุบันเป็นผู้รับสินค้า
          </>
        }
      />
    </div>
  );
}

// ไม่ได้รับ/ไม่ครบ — ต้องมีหมายเหตุทุกครั้ง
function MissingDialog({ item, onClose, onConfirm }: { item: BillItemDetail | null; onClose: () => void; onConfirm: (note: string) => Promise<void> }) {
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const quick = ['ไม่ได้รับของ', 'ได้รับไม่ครบจำนวน', 'ได้รับของผิดรายการ', 'ของเสียหาย'];

  useEffect(() => {
    if (!item) return;
    const timer = setTimeout(() => {
      setNote('');
      setError(null);
    }, 0);
    return () => clearTimeout(timer);
  }, [item]);

  const confirm = async () => {
    if (!note.trim()) return setError('กรุณาระบุหมายเหตุ เช่น ขาดกี่ชิ้น หรือได้ของผิด');
    setBusy(true);
    try {
      await onConfirm(note.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={Boolean(item)}
      title="ไม่ได้รับ / ได้รับไม่ครบ"
      tone="danger"
      confirmLabel="บันทึก"
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
      message={<b>{item?.substitution?.product_name ?? item?.product_name}</b>}
    >
      <div className="space-y-2">
        <div className="flex flex-wrap gap-1.5">
          {quick.map((text) => (
            <button key={text} type="button" onClick={() => setNote(text)} className="rounded-full bg-rose-50 px-3 py-1 text-xs font-bold text-rose-600 ring-1 ring-rose-100">
              {text}
            </button>
          ))}
        </div>
        <textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          className={`${inputClass} min-h-20 ${error ? 'border-rose-400 ring-4 ring-rose-100' : ''}`}
          maxLength={500}
          placeholder="หมายเหตุ (บังคับ) เช่น ได้มา 2 จาก 5 ชิ้น"
          autoFocus
        />
        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}
