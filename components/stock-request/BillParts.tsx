'use client';

import { AUDIT_ACTION_LABEL, FIELD_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/lib/stock-request/constants';
import { formatDateTime, formatNumber } from '@/lib/stock-request/client';
import { isPartial, parseShortReason, sentQty, shortQty } from '@/lib/stock-request/qty';
import type { AuditLogRow, BillDetail, BillItemDetail, JsonObject } from '@/lib/stock-request/types';
import { PhotoThumb } from './ui';

/** ความคืบหน้าการแพ็คของ (จากการติ๊กในหน้าแพ็คของ) — done = แพ็คครบทุกรายการแล้ว */
export function packingProgress(bill: BillDetail) {
  const items = bill.items.filter((item) => !item.is_removed);
  const picked = items.filter((item) => item.picked_at);
  const checkers = [...new Set(picked.map((item) => item.picked_by).filter((name): name is string => !!name))];
  const lastPickedAt = picked.reduce<string | null>((latest, item) => (!latest || (item.picked_at as string) > latest ? item.picked_at : latest), null);
  return { total: items.length, picked: picked.length, done: items.length > 0 && picked.length === items.length, checkers, lastPickedAt };
}

/** ไทม์ไลน์สถานะ: รอตัดบิล → ตัดบิล → กำลังแพ็คของ → จัดส่ง → ได้รับ */
export function StatusTimeline({ bill }: { bill: BillDetail }) {
  const packing = packingProgress(bill);
  const statusIndex = STATUS_ORDER.indexOf(bill.status);
  // ขั้นแพ็คของไม่ใช่สถานะในฐานข้อมูล — ถือว่าเสร็จเมื่อเช็คของครบ (หรือบิลจัดส่งไปแล้ว)
  const packed = statusIndex >= 2 || (bill.status === 'billed' && packing.done);
  const steps = [
    { label: STATUS_LABEL.pending, done: true, time: bill.created_at, who: null },
    { label: STATUS_LABEL.billed, done: statusIndex >= 1, time: bill.billed_at, who: bill.responsible_name ? `ผู้รับผิดชอบ: ${bill.responsible_name}` : bill.billed_by_name },
    {
      label: packed ? 'แพ็คของเสร็จ' : 'กำลังแพ็คของ',
      done: packed,
      active: !packed && bill.status === 'billed',
      time: packed ? packing.lastPickedAt : null,
      who: packed ? (packing.checkers.length ? `ผู้แพ็ค: ${packing.checkers.join(', ')}` : null) : bill.status === 'billed' ? `แพ็คแล้ว ${packing.picked}/${packing.total}` : null,
    },
    { label: STATUS_LABEL.shipped, done: statusIndex >= 2, time: bill.shipped_at, who: bill.shipped_name ? `ผู้ส่ง: ${bill.shipped_name}` : bill.shipped_by_name },
    { label: STATUS_LABEL.received, done: statusIndex >= 3, time: bill.received_at, who: bill.received_by_name },
  ];
  const lastDone = steps.reduce((last, step, index) => (step.done ? index : last), 0);

  return (
    <ol className="grid grid-cols-5 gap-1">
      {steps.map((step, index) => (
        <li key={index} className="flex flex-col items-center text-center">
          <div className="flex w-full items-center">
            <span className={`h-0.5 flex-1 ${index === 0 ? 'bg-transparent' : step.done || step.active ? 'bg-pink-400' : 'bg-slate-200'}`} />
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${
                step.done ? 'bg-pink-500 text-white' : step.active ? 'bg-amber-100 text-amber-700 ring-2 ring-amber-300' : 'bg-slate-100 text-slate-400'
              }`}
            >
              {step.done ? '✓' : step.active ? '📦' : index + 1}
            </span>
            <span className={`h-0.5 flex-1 ${index === steps.length - 1 ? 'bg-transparent' : index < lastDone ? 'bg-pink-400' : 'bg-slate-200'}`} />
          </div>
          <span className={`mt-1.5 text-[11px] font-bold leading-tight ${step.done ? 'text-slate-700' : step.active ? 'text-amber-700' : 'text-slate-400'}`}>{step.label}</span>
          {step.done && step.time && <span className="mt-0.5 text-[10px] leading-tight text-slate-400">{formatDateTime(step.time)}</span>}
          {(step.done || step.active) && step.who && <span className="text-[10px] leading-tight text-slate-500">{step.who}</span>}
        </li>
      ))}
    </ol>
  );
}

/** สินค้าเดิม ↔ สินค้าทดแทน แสดงคู่กัน */
export function SubstitutionPair({ item }: { item: BillItemDetail }) {
  const sub = item.substitution;
  if (!sub) return null;
  return (
    <div className="mt-3 grid gap-2 rounded-xl border border-pink-100 bg-pink-50/50 p-3 sm:grid-cols-[1fr_auto_1fr] sm:items-center">
      <div className="flex gap-2.5">
        <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-14 w-14" />
        <div className="min-w-0 text-xs">
          <p className="font-bold text-slate-400 line-through decoration-slate-300">สินค้าเดิม</p>
          <p className="font-bold text-slate-700">{item.product_name}</p>
          <p className="text-slate-500">รหัส {item.product_code}</p>
          <p className="text-slate-500">สาขาสั่ง {formatNumber(item.stock_on_hand)} ชิ้น</p>
        </div>
      </div>
      <span className="text-center text-lg text-pink-400 sm:px-1">→</span>
      <div className="flex gap-2.5">
        <PhotoThumb url={sub.photo_url} alt={sub.product_name} className="h-14 w-14" />
        <div className="min-w-0 text-xs">
          <p className="font-bold text-pink-600">สินค้าทดแทน</p>
          <p className="font-bold text-slate-800">{sub.product_name}</p>
          <p className="text-slate-500">รหัส {sub.product_code}</p>
        </div>
      </div>
      <p className="text-xs text-pink-700 sm:col-span-3">
        <span className="font-bold">เหตุผล:</span> {sub.reason}
        {sub.created_by_name && <span className="text-pink-400"> · โดย {sub.created_by_name}</span>}
      </p>
    </div>
  );
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '-';
  if (typeof value === 'boolean') return value ? 'ใช่' : 'ไม่';
  if (typeof value === 'number') return value.toLocaleString('th-TH');
  if (typeof value === 'string') return value;
  return JSON.stringify(value);
}

const SHOWN_KEYS = ['product_name', 'product_code', 'stock_on_hand', 'staff_note', 'photo_path', 'hq_ship_qty', 'hq_note', 'ship_qty', 'is_removed', 'status', 'item_count'];

function describeChange(log: AuditLogRow): string[] {
  const before = (log.before_data ?? {}) as JsonObject;
  const after = (log.after_data ?? {}) as JsonObject;
  if (log.action === 'substitution_set') {
    const name = after.product_name as string | undefined;
    const code = after.product_code as string | undefined;
    const lines = [`ทดแทนด้วย ${name ?? '-'} (${code ?? '-'})`];
    if (before.product_name) lines.unshift(`เดิม: ${formatValue(before.product_name)} (${formatValue(before.product_code)})`);
    return lines;
  }
  if (log.action === 'substitution_remove') return [`ยกเลิกสินค้าทดแทน ${formatValue(before.product_name)}`];
  if (log.action === 'item_add') return [`${formatValue(after.product_name)} (${formatValue(after.product_code)})`];
  const keys = SHOWN_KEYS.filter((key) => key in before || key in after);
  return keys.map((key) => `${FIELD_LABEL[key] ?? key}: ${formatValue(before[key])} → ${formatValue(after[key])}`);
}

/** รายการประวัติการแก้ไข (audit log) */
export function AuditList({ logs, itemNames }: { logs: AuditLogRow[]; itemNames?: Map<string, string> }) {
  if (logs.length === 0) return <p className="py-4 text-center text-sm text-slate-400">ยังไม่มีประวัติการแก้ไข</p>;
  return (
    <ul className="space-y-2">
      {logs.map((log) => (
        <li key={log.id} className={`rounded-xl border px-3.5 py-2.5 text-xs ${log.after_billing ? 'border-amber-200 bg-amber-50/60' : 'border-slate-100 bg-white'}`}>
          <div className="flex flex-wrap items-center justify-between gap-1">
            <span className="font-black text-slate-700">
              {AUDIT_ACTION_LABEL[log.action]}
              {log.bill_item_id && itemNames?.get(log.bill_item_id) && <span className="font-semibold text-slate-500"> · {itemNames.get(log.bill_item_id)}</span>}
            </span>
            <span className="text-slate-400">{formatDateTime(log.created_at)}</span>
          </div>
          <ul className="mt-1 space-y-0.5 text-slate-600">
            {describeChange(log).map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
          <p className="mt-1 text-slate-500">
            โดย <span className="font-bold">{log.admin_name}</span>
            {log.after_billing && <span className="ml-1 rounded bg-amber-100 px-1.5 py-0.5 font-bold text-amber-700">แก้หลังตัดบิล</span>}
          </p>
          {log.reason && <p className="mt-1 text-slate-700"><span className="font-bold">เหตุผล:</span> {log.reason}</p>}
        </li>
      ))}
    </ul>
  );
}

/** ป้ายเล็กบอกว่าบิลมีปัญหา (สาขาแจ้งของไม่ครบ) หรือแก้ไขแล้ว */
export function IssueBadge({ bill }: { bill: Pick<BillDetail, 'issue_status'> }) {
  if (bill.issue_status === 'open') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-rose-100 px-2.5 py-0.5 text-[11px] font-black text-rose-700 ring-1 ring-rose-200">⚠️ ของไม่ครบ · รอแก้ไข</span>;
  }
  if (bill.issue_status === 'resolved') {
    return <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-0.5 text-[11px] font-bold text-emerald-700 ring-1 ring-emerald-100">✅ แก้ไขปัญหาแล้ว</span>;
  }
  return null;
}

/** กล่องรายละเอียดปัญหาของบิล: รายการที่สาขาแจ้งว่าไม่ได้รับ/ไม่ครบ + ผลการแก้ไข · onResolve = ปุ่มปิดเรื่อง (หลังบ้าน) */
export function IssueBanner({ bill, onResolve }: { bill: BillDetail; onResolve?: () => void }) {
  if (!bill.issue_status) return null;
  const missing = bill.items.filter((item) => !item.is_removed && item.received_state === 'missing');
  const open = bill.issue_status === 'open';
  return (
    <section className={`rounded-2xl p-4 ring-1 ${open ? 'bg-rose-50 ring-rose-200' : 'bg-emerald-50/60 ring-emerald-100'}`}>
      <p className={`text-sm font-black ${open ? 'text-rose-700' : 'text-emerald-700'}`}>
        {open ? '⚠️ สาขาแจ้งว่าได้รับของไม่ครบ — รอสำนักงานใหญ่แก้ไข' : '✅ แก้ไขปัญหาแล้ว'}
      </p>
      <p className="mt-0.5 text-[11px] text-slate-500">
        แจ้งเมื่อ {formatDateTime(bill.issue_opened_at)}
        {bill.received_by_name ? ` · โดย ${bill.received_by_name}` : ''}
      </p>
      {missing.length > 0 ? (
        <ul className="mt-2 space-y-1 text-xs">
          {missing.map((item) => (
            <li key={item.id} className="rounded-lg bg-white/80 px-2.5 py-1.5 ring-1 ring-rose-100">
              <b>{item.substitution?.product_name ?? item.product_name}</b> ({item.substitution?.product_code ?? item.product_code}) — <span className="text-rose-600">{item.received_note ?? '-'}</span>
            </li>
          ))}
        </ul>
      ) : (
        bill.issue_summary && <p className="mt-2 text-xs text-slate-600">{bill.issue_summary}</p>
      )}
      {!open && (
        <p className="mt-2 rounded-lg bg-white/80 px-2.5 py-1.5 text-xs text-emerald-800 ring-1 ring-emerald-100">
          วิธีแก้: {bill.issue_resolved_note} · โดย {bill.issue_resolved_by} · {formatDateTime(bill.issue_resolved_at)}
        </p>
      )}
      {open && onResolve && (
        <button type="button" onClick={onResolve} className="mt-3 rounded-xl bg-rose-600 px-4 py-2 text-sm font-black text-white shadow-sm hover:bg-rose-700">
          แก้ไขปัญหา / ยกยอดไปบิลถัดไป
        </button>
      )}
    </section>
  );
}

/** บันทึกล่าสุดที่นำรายการออกจากบิล (เหตุผล / ใครทำ / เมื่อไร) */
export function removalLog(bill: Pick<BillDetail, 'audit_logs'>, itemId: string): AuditLogRow | undefined {
  return bill.audit_logs
    .filter((log) => log.bill_item_id === itemId && log.action === 'item_remove')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
}

/** รายการที่สำนักงานใหญ่ไม่ได้จัดส่ง พร้อมเหตุผล — ให้สาขารู้ว่าทำไมของไม่มา */
export function RemovedItems({ bill }: { bill: BillDetail }) {
  const removed = bill.items.filter((item) => item.is_removed);
  if (removed.length === 0) return null;
  return (
    <section className="rounded-2xl border border-slate-200 bg-slate-50 p-3">
      <p className="mb-2 text-sm font-black text-slate-700">📭 สำนักงานใหญ่ไม่ได้จัดส่ง ({removed.length} รายการ)</p>
      <ul className="space-y-2">
        {removed.map((item) => {
          const log = removalLog(bill, item.id);
          return (
            <li key={item.id} className="flex gap-3 rounded-xl bg-white p-2.5 ring-1 ring-slate-100">
              <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-12 w-12" />
              <div className="min-w-0 text-xs">
                <p className="text-sm font-bold text-slate-700">
                  {item.product_name} <span className="font-mono text-xs font-normal text-slate-400">({item.product_code})</span>
                </p>
                <p className="mt-0.5 font-bold text-rose-600">เหตุผล: {log?.reason || 'ไม่ได้ระบุ'}</p>
                {log && (
                  <p className="text-slate-400">
                    {formatDateTime(log.created_at)} · {log.admin_name}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** จำนวนที่สั่ง และจำนวนที่ส่งจริง (ถ้าของไม่พอ) พร้อมเหตุผลล่าสุด */
export function QtyLine({ bill, item }: { bill: Pick<BillDetail, 'audit_logs'>; item: BillItemDetail }) {
  if (!isPartial(item)) {
    return (
      <p className="mt-1 text-xs text-slate-600">
        สั่ง <b className="text-pink-700">{formatNumber(item.stock_on_hand)}</b> ชิ้น
      </p>
    );
  }
  const log = bill.audit_logs
    .filter((entry) => entry.bill_item_id === item.id && entry.action === 'ship_qty_change')
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  return (
    <div className="mt-1 rounded-lg bg-amber-50 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
      <p className="font-black">
        สั่ง {formatNumber(item.stock_on_hand)} · ส่งได้ {formatNumber(sentQty(item))} ชิ้น (ขาด {formatNumber(shortQty(item))})
      </p>
      {(() => {
        const parsed = parseShortReason(log?.reason);
        return parsed && <p>เหตุผล: {parsed.reason}{parsed.packer ? ` · ผู้แพ็ค ${parsed.packer}` : ''}</p>;
      })()}
    </div>
  );
}
