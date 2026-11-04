'use client';

import { useCallback, useEffect, useState } from 'react';
import { apiFetch, errorMessage } from '@/lib/stock-request/client';
import { ConfirmDialog, InlineError, inputClass } from './ui';

interface Candidate {
  id: string;
  bill_no: string;
  branch_name: string;
  item_count: number;
}

interface CutResult {
  cut: { bill_no: string; branch_name: string }[];
  failed: { bill_no: string; branch_name: string; error: string }[];
}

const RESPONSIBLE_KEY = 'sr_responsible_names'; // ชื่อเดียวกับหน้าตรวจและตัดบิล

// ปุ่มใหญ่ "ตัดบิลทุกสาขา" — การตัดบิลต้องทำพร้อมกันทุกสาขา จึงตัดได้ในครั้งเดียว
export default function CutAllPanel({ onDone }: { onDone: () => void }) {
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<CutResult | null>(null);

  const load = useCallback(async () => {
    try {
      setCandidates((await apiFetch<{ bills: Candidate[] }>('/admin/stock-request/api/bills/cut-all')).bills);
    } catch {
      setCandidates([]);
    }
  }, []);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  const openDialog = () => {
    setError(null);
    try {
      const list = JSON.parse(localStorage.getItem(RESPONSIBLE_KEY) ?? '[]');
      const names = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
      setRecent(names);
      setName(names[0] ?? '');
    } catch {
      setRecent([]);
    }
    setOpen(true);
  };

  const confirm = async () => {
    const responsible = name.trim();
    if (!responsible) return setError('กรุณาระบุชื่อผู้รับผิดชอบบิล');
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(RESPONSIBLE_KEY, JSON.stringify([responsible, ...recent.filter((item) => item !== responsible)].slice(0, 8)));
      } catch {
        // ไม่มี localStorage ก็ตัดบิลต่อได้
      }
      setResult(await apiFetch<CutResult>('/admin/stock-request/api/bills/cut-all', { method: 'POST', json: { responsibleName: responsible } }));
      setOpen(false);
      await load();
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  if (!candidates) return null;
  const totalItems = candidates.reduce((sum, bill) => sum + bill.item_count, 0);

  return (
    <section className="rounded-2xl border border-pink-100 bg-linear-to-r from-pink-50 to-rose-50 p-4 shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-base font-black text-slate-800">✂️ ตัดบิลรอบนี้</p>
          <p className="text-sm text-slate-600">
            {candidates.length ? (
              <>
                รอตัด <b>{candidates.length}</b> สาขา · รวม <b>{totalItems}</b> รายการ
              </>
            ) : (
              'ไม่มีบิลที่รอตัด (บิลที่ยังไม่มีรายการไม่ต้องตัด)'
            )}
          </p>
        </div>
        <button
          type="button"
          disabled={candidates.length === 0}
          onClick={openDialog}
          className="rounded-2xl bg-linear-to-r from-pink-500 to-rose-500 px-6 py-3.5 text-base font-black text-white shadow-md transition hover:shadow-lg disabled:opacity-40 sm:px-8"
        >
          ✂️ ตัดบิลทุกสาขา
        </button>
      </div>

      {result && (
        <div className={`mt-3 rounded-xl p-3 text-sm ${result.failed.length ? 'bg-amber-50 text-amber-800' : 'bg-emerald-50 text-emerald-800'}`}>
          <p className="font-bold">
            ตัดบิลแล้ว {result.cut.length} สาขา{result.failed.length ? ` · ไม่สำเร็จ ${result.failed.length} สาขา` : ''}
          </p>
          {result.failed.map((bill) => (
            <p key={bill.bill_no} className="text-xs">
              ✗ {bill.branch_name} ({bill.bill_no}): {bill.error}
            </p>
          ))}
        </div>
      )}

      <ConfirmDialog
        open={open}
        title="ตัดบิลทุกสาขา"
        confirmLabel={`ตัดบิล ${candidates.length} สาขา`}
        busy={busy}
        onCancel={() => setOpen(false)}
        onConfirm={confirm}
        message="ตัดบิลที่มีรายการของทุกสาขาพร้อมกัน — หลังตัดบิล สาขาจะแก้ไขบิลนี้ไม่ได้ และระบบเปิดบิลใหม่ให้ทุกสาขาอัตโนมัติ"
      >
        <div className="space-y-3">
          <ul className="max-h-56 divide-y divide-pink-50 overflow-y-auto rounded-xl border border-pink-100 text-sm">
            {candidates.map((bill) => (
              <li key={bill.id} className="flex items-center justify-between gap-2 px-3 py-2">
                <span className="font-bold text-slate-700">{bill.branch_name}</span>
                <span className="text-xs text-slate-500">
                  <span className="font-mono">{bill.bill_no}</span> · {bill.item_count} รายการ
                </span>
              </li>
            ))}
          </ul>
          {recent.length > 0 && (
            <div className="flex flex-wrap gap-1.5">
              {recent.map((item) => (
                <button
                  key={item}
                  type="button"
                  onClick={() => setName(item)}
                  className={`rounded-full px-3 py-1 text-xs font-bold ring-1 ${item === name.trim() ? 'bg-pink-600 text-white ring-pink-600' : 'bg-pink-50 text-pink-700 ring-pink-100'}`}
                >
                  {item}
                </button>
              ))}
            </div>
          )}
          <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} maxLength={100} placeholder="ชื่อผู้รับผิดชอบบิล (บังคับ)" />
          <InlineError message={error} />
        </div>
      </ConfirmDialog>
    </section>
  );
}
