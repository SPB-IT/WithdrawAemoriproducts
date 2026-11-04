'use client';

import { AUDIT_ACTION_LABEL, FIELD_LABEL, STATUS_LABEL, STATUS_ORDER } from '@/lib/stock-request/constants';
import { formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { AuditLogRow, BillDetail, BillItemDetail, JsonObject } from '@/lib/stock-request/types';
import { PhotoThumb } from './ui';

/** ไทม์ไลน์สถานะ: รออนุมัติ → ตัดบิล → จัดส่ง → ได้รับ */
export function StatusTimeline({ bill }: { bill: BillDetail }) {
  const reached = STATUS_ORDER.indexOf(bill.status);
  const timeFor = (index: number) =>
    [bill.created_at, bill.billed_at, bill.shipped_at, bill.received_at][index];
  const whoFor = (index: number) =>
    [null, bill.billed_by_name, bill.shipped_by_name, bill.received_by_name][index];

  return (
    <ol className="grid grid-cols-4 gap-1">
      {STATUS_ORDER.map((status, index) => {
        const done = index <= reached;
        return (
          <li key={status} className="flex flex-col items-center text-center">
            <div className="flex w-full items-center">
              <span className={`h-0.5 flex-1 ${index === 0 ? 'bg-transparent' : done ? 'bg-pink-400' : 'bg-slate-200'}`} />
              <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-black ${done ? 'bg-pink-500 text-white' : 'bg-slate-100 text-slate-400'}`}>
                {done ? '✓' : index + 1}
              </span>
              <span className={`h-0.5 flex-1 ${index === STATUS_ORDER.length - 1 ? 'bg-transparent' : index < reached ? 'bg-pink-400' : 'bg-slate-200'}`} />
            </div>
            <span className={`mt-1.5 text-[11px] font-bold leading-tight ${done ? 'text-slate-700' : 'text-slate-400'}`}>{STATUS_LABEL[status]}</span>
            {done && <span className="mt-0.5 text-[10px] leading-tight text-slate-400">{formatDateTime(timeFor(index))}</span>}
            {done && whoFor(index) && <span className="text-[10px] leading-tight text-slate-500">{whoFor(index)}</span>}
          </li>
        );
      })}
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
          <p className="text-slate-500">คงเหลือที่สาขาระบุ {formatNumber(item.stock_on_hand)}</p>
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

const SHOWN_KEYS = ['product_name', 'product_code', 'stock_on_hand', 'hq_ship_qty', 'hq_note', 'ship_qty', 'is_removed', 'status', 'item_count'];

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
