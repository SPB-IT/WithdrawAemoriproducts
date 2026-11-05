'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ConfirmDialog, ErrorState, InlineError, LoadingState, PhotoThumb, StatusBadge, inputClass, primaryButton, secondaryButton } from '@/components/stock-request/ui';
import { ClientApiError, apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillDetail } from '@/lib/stock-request/types';

const RESPONSIBLE_KEY = 'sr_responsible_names'; // ชื่อผู้รับผิดชอบที่เคยใช้ในเครื่องนี้

function readResponsibles(): string[] {
  try {
    const list = JSON.parse(localStorage.getItem(RESPONSIBLE_KEY) ?? '[]');
    return Array.isArray(list) ? list.filter((name) => typeof name === 'string') : [];
  } catch {
    return [];
  }
}

function saveResponsible(name: string) {
  try {
    localStorage.setItem(RESPONSIBLE_KEY, JSON.stringify([name, ...readResponsibles().filter((item) => item !== name)].slice(0, 8)));
  } catch {
    // ไม่กระทบการตัดบิล
  }
}

// หน้าตรวจสอบก่อนตัดบิล: สินค้า+รูป, จำนวนที่สั่ง, สินค้าทดแทน, หมายเหตุ → ระบุผู้รับผิดชอบบิล → ยืนยันตัดบิล
export default function ReviewBillPage() {
  const { billId } = useParams<{ billId: string }>();
  const router = useRouter();
  const [bill, setBill] = useState<BillDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [checked, setChecked] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const [cutError, setCutError] = useState<string | null>(null);
  // ผู้รับผิดชอบบิล — ผู้ดูแลใช้รหัสกลางร่วมกัน จึงต้องระบุชื่อคนจริง (สาขาเห็นชื่อนี้)
  const [responsible, setResponsible] = useState('');
  const [responsibles, setResponsibles] = useState<string[]>([]);
  const [responsibleMissing, setResponsibleMissing] = useState(false);
  const responsibleRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => {
      const list = readResponsibles();
      setResponsibles(list);
      setResponsible(list[0] ?? '');
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const openConfirm = () => {
    if (!responsible.trim()) {
      setResponsibleMissing(true);
      responsibleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      responsibleRef.current?.focus({ preventScroll: true });
      return;
    }
    setConfirming(true);
  };

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

  const cut = async () => {
    if (!bill) return;
    setBusy(true);
    setCutError(null);
    try {
      await apiFetch(`/admin/stock-request/api/bills/${bill.id}/cut`, { method: 'POST', json: { expectedVersion: bill.version, responsibleName: responsible.trim() } });
      saveResponsible(responsible.trim());
      router.replace(`/admin/stock-request/bills/${bill.id}`);
    } catch (err) {
      setConfirming(false);
      if (err instanceof ClientApiError && err.code === 'SR_VERSION_CONFLICT') {
        setCutError('มีรายการใหม่หรือมีการแก้ไขระหว่างที่คุณตรวจ ระบบโหลดข้อมูลล่าสุดให้แล้ว กรุณาตรวจอีกครั้งก่อนตัดบิล');
        setChecked(false);
        await load();
      } else {
        setCutError(errorMessage(err));
        await load();
      }
    } finally {
      setBusy(false);
    }
  };

  if (error && !bill) return <ErrorState message={error} onRetry={load} />;
  if (!bill) return <LoadingState />;

  const items = bill.items.filter((item) => !item.is_removed);
  const substituted = items.filter((item) => item.substitution);

  if (bill.status !== 'pending') {
    return (
      <div className="mx-auto max-w-lg space-y-4 py-10 text-center">
        <p className="text-lg font-black">บิลนี้ถูกตัดแล้ว</p>
        <p className="text-sm text-slate-500">
          ตัดเมื่อ {formatDateTime(bill.billed_at)} โดย {bill.billed_by_name ?? '-'}
        </p>
        <Link href={`/admin/stock-request/bills/${bill.id}`} className={secondaryButton}>
          กลับไปหน้าบิล
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Link href={`/admin/stock-request/bills/${bill.id}`} className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← กลับไปแก้ไขบิล
      </Link>
      <section className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-bold text-pink-600">{bill.branch_name}</p>
            <h1 className="text-xl font-black">ตรวจสอบก่อนตัดบิล · <span className="font-mono">{bill.bill_no}</span></h1>
            <p className="text-xs text-slate-500">สร้างเมื่อ {formatDateTime(bill.created_at)}</p>
          </div>
          <StatusBadge status={bill.status} />
        </div>
        <div className="mt-4 grid gap-2 text-sm sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 px-3 py-2">
            รายการทั้งหมด <b>{items.length}</b>
          </div>
          <div className="rounded-xl bg-pink-50 px-3 py-2 text-pink-700">
            มีสินค้าทดแทน <b>{substituted.length}</b>
          </div>
        </div>
      </section>

      <InlineError message={cutError} />

      <div className="overflow-hidden rounded-2xl border border-pink-100 bg-white shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[680px] text-sm">
            <thead className="bg-slate-50 text-left text-xs font-bold text-slate-500">
              <tr>
                <th className="px-3 py-3">#</th>
                <th className="px-3 py-3">รูป</th>
                <th className="px-3 py-3">สินค้า</th>
                <th className="px-3 py-3 text-center">จำนวนที่สั่ง</th>
                <th className="px-3 py-3">สินค้าทดแทน</th>
                <th className="px-3 py-3">หมายเหตุ</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 align-top">
              {items.map((item, index) => (
                <tr key={item.id}>
                  <td className="px-3 py-3 text-xs text-slate-400">{index + 1}</td>
                  <td className="px-3 py-3">
                    <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-14 w-14" />
                  </td>
                  <td className="px-3 py-3">
                    <p className="font-bold">{item.product_name}</p>
                    <p className="text-xs text-slate-500">{item.product_code}</p>
                    <p className="text-[11px] text-slate-400">{item.reported_by_name}</p>
                  </td>
                  <td className="px-3 py-3 text-center">{formatNumber(item.stock_on_hand)}</td>
                  <td className="px-3 py-3 text-xs">
                    {item.substitution ? (
                      <>
                        <p className="font-bold text-pink-700">
                          {item.substitution.product_name}
                        </p>
                        <p className="text-slate-500">{item.substitution.product_code}</p>
                        <p className="text-slate-500">เหตุผล: {item.substitution.reason}</p>
                      </>
                    ) : (
                      '-'
                    )}
                  </td>
                  <td className="px-3 py-3 text-xs text-slate-600">
                    {item.staff_note && <p>สาขา: {item.staff_note}</p>}
                    {item.hq_note && <p>HQ: {item.hq_note}</p>}
                    {!item.staff_note && !item.hq_note && '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <section className="space-y-4 rounded-2xl border border-pink-200 bg-pink-50/50 p-5">
        <div>
          <label className="block text-sm font-black text-slate-700">
            ผู้รับผิดชอบบิลนี้ <span className="text-rose-500">*</span>
            <input
              ref={responsibleRef}
              value={responsible}
              onChange={(event) => {
                setResponsible(event.target.value);
                if (event.target.value.trim()) setResponsibleMissing(false);
              }}
              className={`${inputClass} mt-1.5 ${responsibleMissing ? 'border-rose-400 ring-4 ring-rose-100' : ''}`}
              placeholder="ชื่อคนที่ดูแลบิลนี้ (สาขาจะเห็นชื่อนี้)"
              maxLength={100}
            />
          </label>
          {responsibleMissing && <p className="mt-1 text-xs font-bold text-rose-600">⚠️ กรุณาระบุผู้รับผิดชอบบิลนี้</p>}
          {responsibles.length > 0 && (
            <div className="mt-2 flex flex-wrap gap-1.5">
              {responsibles.map((name) => {
                const active = name === responsible.trim();
                return (
                  <button
                    key={name}
                    type="button"
                    onClick={() => {
                      setResponsible(name);
                      setResponsibleMissing(false);
                    }}
                    className={`rounded-full px-3 py-1 text-xs font-bold ring-1 transition ${active ? 'bg-pink-500 text-white ring-pink-500' : 'bg-white text-pink-700 ring-pink-100'}`}
                  >
                    {active ? '✓' : '👤'} {name}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <label className="flex items-start gap-3 text-sm font-semibold">
          <input type="checkbox" checked={checked} onChange={(event) => setChecked(event.target.checked)} className="mt-0.5 h-5 w-5 accent-pink-600" />
          ตรวจสอบสินค้า รูปภาพ จำนวนที่สั่ง สินค้าทดแทน และหมายเหตุครบถ้วนแล้ว
        </label>
        <div className="flex flex-wrap justify-end gap-2">
          <Link href={`/admin/stock-request/bills/${bill.id}`} className={secondaryButton}>
            กลับไปแก้ไข
          </Link>
          <button type="button" disabled={!checked || items.length === 0} onClick={openConfirm} className={`${primaryButton}`}>
            ✂️ ยืนยันตัดบิล
          </button>
        </div>
      </section>

      <ConfirmDialog
        open={confirming}
        title="ยืนยันตัดบิล"
        confirmLabel="ตัดบิล"
        busy={busy}
        onCancel={() => setConfirming(false)}
        onConfirm={cut}
        message={
          <>
            ตัดบิล <b className="font-mono">{bill.bill_no}</b> ของ <b>{bill.branch_name}</b> จำนวน {items.length} รายการ
            <br />
            ผู้รับผิดชอบ: <b>{responsible.trim()}</b>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-xs">
              <li>ปิดรับรายการจากสาขาในบิลนี้ และเปิดบิลใหม่ให้สาขาอัตโนมัติ</li>
              <li>บันทึกข้อมูลรายการ ณ เวลานี้ พร้อมชื่อผู้รับผิดชอบ {responsible.trim()}</li>
              <li>การแก้ไขหลังจากนี้ต้องระบุเหตุผลทุกครั้ง</li>
            </ul>
          </>
        }
      />
    </div>
  );
}
