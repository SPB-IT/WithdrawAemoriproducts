'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ErrorState, InlineError, LoadingState, PhotoThumb, Spinner } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';

type PickState = 'picked' | 'missing';

interface PickItem {
  id: string;
  product_name: string;
  product_code: string;
  replaced: string | null;
  stock_on_hand: number | null;
  photo_url: string | null;
  state: PickState | null;
  note: string | null;
  by: string | null;
}

interface PickData {
  bill: { bill_no: string; branch_name: string; billed_at: string | null; responsible_name: string | null };
  items: PickItem[];
  expires_at: string;
  last_saved_at: string | null;
  last_saved_by: string | null;
}

type Choice = { state: PickState | null; note: string };

const NAME_KEY = 'sr_picker_names'; // ชื่อเดียวกับหน้าแพ็คของของแอดมิน
const MISSING_REASONS = ['ของหมด', 'หาไม่เจอ', 'ของเสีย/ชำรุด'];

// หน้าลิงก์หยิบของ (เปิดจากลิงก์ที่แอดมินส่งให้ ไม่ต้องเข้าระบบ): เดินหยิบของ → กด ✓ หยิบได้ / ✗ ไม่มี → บันทึก
export default function PickLinkPage() {
  const { token } = useParams<{ token: string }>();
  const [data, setData] = useState<PickData | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  const [name, setName] = useState('');
  const [recentNames, setRecentNames] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await apiFetch<PickData>(`/api/pick/${encodeURIComponent(token)}`);
      setData(result);
      setChoices(Object.fromEntries(result.items.map((item) => [item.id, { state: item.state, note: item.note ?? '' }])));
      setLoadError(null);
    } catch (err) {
      setLoadError(errorMessage(err));
    }
  }, [token]);

  useEffect(() => {
    const timer = setTimeout(() => {
      void load();
      try {
        const list = JSON.parse(localStorage.getItem(NAME_KEY) ?? '[]');
        const names = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
        setRecentNames(names);
        setName(names[0] ?? '');
      } catch {
        // ไม่มี localStorage ก็พิมพ์ชื่อเองได้
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [load]);

  // รายการที่เปลี่ยนจากที่บันทึกไว้ (ส่งเฉพาะส่วนนี้)
  const changes = useMemo(
    () =>
      (data?.items ?? []).filter((item) => {
        const choice = choices[item.id];
        if (!choice?.state) return false;
        return choice.state !== item.state || (choice.state === 'missing' && choice.note.trim() !== (item.note ?? ''));
      }),
    [data, choices],
  );

  if (loadError && !data) {
    return (
      <main className="mx-auto w-full max-w-lg px-4 py-10">
        <ErrorState message={loadError} onRetry={load} />
      </main>
    );
  }
  if (!data) return <LoadingState label="กำลังโหลดรายการ..." />;

  const counts = data.items.reduce(
    (sum, item) => {
      const state = choices[item.id]?.state;
      return { picked: sum.picked + (state === 'picked' ? 1 : 0), missing: sum.missing + (state === 'missing' ? 1 : 0) };
    },
    { picked: 0, missing: 0 },
  );
  const pending = data.items.length - counts.picked - counts.missing;

  const setChoice = (itemId: string, patch: Partial<Choice>) => {
    setSaved(null);
    setChoices((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? { state: null, note: '' }), ...patch } }));
  };

  const save = async () => {
    const picker = name.trim();
    if (!picker) return setError('กรุณาใส่ชื่อผู้หยิบของก่อนบันทึก');
    const noNote = changes.find((item) => choices[item.id]?.state === 'missing' && !choices[item.id]?.note.trim());
    if (noNote) return setError(`กรุณาระบุหมายเหตุของ “${noNote.product_name}” ว่าทำไมไม่มี`);
    setSaving(true);
    setError(null);
    try {
      try {
        localStorage.setItem(NAME_KEY, JSON.stringify([picker, ...recentNames.filter((item) => item !== picker)].slice(0, 8)));
      } catch {
        // บันทึกชื่อในเครื่องไม่ได้ก็ไม่เป็นไร
      }
      const result = await apiFetch<{ picked: number; missing: number }>(`/api/pick/${encodeURIComponent(token)}`, {
        method: 'POST',
        json: { pickerName: picker, items: changes.map((item) => ({ itemId: item.id, state: choices[item.id].state, note: choices[item.id].note.trim() })) },
      });
      setSaved(`บันทึกแล้ว · หยิบได้ ${result.picked} · ไม่มี ${result.missing} รายการ`);
      await load();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="mx-auto w-full max-w-lg space-y-3 px-4 pb-32 pt-4">
      <header className="rounded-3xl bg-linear-to-r from-pink-500 to-rose-400 p-5 text-white shadow-md">
        <p className="text-xs font-bold text-white/80">🛒 รายการหยิบของ · Aemori</p>
        <h1 className="mt-1 text-2xl font-black">{data.bill.branch_name}</h1>
        <p className="font-mono text-sm font-bold text-white/90">{data.bill.bill_no}</p>
        <p className="mt-2 text-[11px] text-white/80">ลิงก์ใช้ได้ถึง {formatDateTime(data.expires_at)}</p>
      </header>

      <section className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
        <label className="text-xs font-black text-slate-600" htmlFor="picker-name">
          ชื่อผู้หยิบของ <span className="text-rose-500">*</span>
        </label>
        <input
          id="picker-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={100}
          placeholder="พิมพ์ชื่อของคุณ"
          className="mt-1 w-full rounded-xl border border-pink-100 bg-pink-50/40 px-3 py-2.5 text-base outline-none focus:border-pink-300 focus:bg-white"
        />
        {recentNames.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {recentNames.map((item) => (
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
        <div className="mt-3 grid grid-cols-3 gap-2 text-center">
          <div className="rounded-xl bg-emerald-50 py-2">
            <p className="text-lg font-black text-emerald-700">{counts.picked}</p>
            <p className="text-[11px] font-bold text-emerald-700">หยิบได้</p>
          </div>
          <div className="rounded-xl bg-rose-50 py-2">
            <p className="text-lg font-black text-rose-600">{counts.missing}</p>
            <p className="text-[11px] font-bold text-rose-600">ไม่มี</p>
          </div>
          <div className="rounded-xl bg-slate-50 py-2">
            <p className="text-lg font-black text-slate-600">{pending}</p>
            <p className="text-[11px] font-bold text-slate-500">ยังไม่เลือก</p>
          </div>
        </div>
        {data.last_saved_at && (
          <p className="mt-2 text-[11px] text-slate-400">
            บันทึกล่าสุด {formatDateTime(data.last_saved_at)}
            {data.last_saved_by ? ` โดย ${data.last_saved_by}` : ''}
          </p>
        )}
      </section>

      {saved && <p className="rounded-2xl bg-emerald-50 px-4 py-3 text-sm font-bold text-emerald-700">✅ {saved} — แจ้งแอดมินแล้ว</p>}

      <ul className="space-y-2.5">
        {data.items.map((item, index) => {
          const choice = choices[item.id] ?? { state: null, note: '' };
          const tone = choice.state === 'picked' ? 'border-emerald-300 bg-emerald-50/60' : choice.state === 'missing' ? 'border-rose-300 bg-rose-50/60' : 'border-pink-100 bg-white';
          return (
            <li key={item.id} className={`rounded-2xl border p-3 shadow-sm transition ${tone}`}>
              <div className="flex gap-3">
                <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-20 w-20" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-400">#{index + 1}</p>
                  <p className="text-base font-black leading-snug text-slate-800">{item.product_name}</p>
                  <p className="font-mono text-xs text-slate-500">{item.product_code}</p>
                  {item.replaced && <p className="text-[11px] text-sky-700">ใช้แทน {item.replaced}</p>}
                  <p className="text-[11px] text-slate-500">สาขาเหลือ {formatNumber(item.stock_on_hand)}</p>
                </div>
              </div>
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  aria-pressed={choice.state === 'picked'}
                  onClick={() => setChoice(item.id, { state: choice.state === 'picked' ? null : 'picked' })}
                  className={`rounded-xl py-3 text-sm font-black transition ${choice.state === 'picked' ? 'bg-emerald-500 text-white shadow' : 'bg-white text-emerald-700 ring-1 ring-emerald-200'}`}
                >
                  ✓ หยิบได้
                </button>
                <button
                  type="button"
                  aria-pressed={choice.state === 'missing'}
                  onClick={() => setChoice(item.id, { state: choice.state === 'missing' ? null : 'missing' })}
                  className={`rounded-xl py-3 text-sm font-black transition ${choice.state === 'missing' ? 'bg-rose-500 text-white shadow' : 'bg-white text-rose-600 ring-1 ring-rose-200'}`}
                >
                  ✗ ไม่มี
                </button>
              </div>
              {choice.state === 'missing' && (
                <div className="mt-2 space-y-1.5">
                  <div className="flex flex-wrap gap-1.5">
                    {MISSING_REASONS.map((reason) => (
                      <button key={reason} type="button" onClick={() => setChoice(item.id, { note: reason })} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-rose-600 ring-1 ring-rose-200">
                        {reason}
                      </button>
                    ))}
                  </div>
                  <input
                    value={choice.note}
                    onChange={(event) => setChoice(item.id, { note: event.target.value })}
                    maxLength={300}
                    placeholder="หมายเหตุ (บังคับ) เช่น ของหมด"
                    className="w-full rounded-xl border border-rose-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400"
                  />
                </div>
              )}
              {item.state === 'picked' && item.by && choice.state === 'picked' && <p className="mt-1.5 text-[11px] font-bold text-emerald-700">บันทึกแล้ว · หยิบโดย {item.by}</p>}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-pink-100 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-lg space-y-2">
          <InlineError message={error} />
          <button
            type="button"
            onClick={save}
            disabled={saving || changes.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-linear-to-r from-pink-500 to-rose-500 py-3.5 text-base font-black text-white shadow-md transition disabled:opacity-40"
          >
            {saving && <Spinner className="h-5 w-5" />}
            {changes.length ? `💾 บันทึก (${changes.length} รายการ)` : pending ? `เหลืออีก ${pending} รายการ` : '✅ บันทึกครบแล้ว'}
          </button>
        </div>
      </div>
    </main>
  );
}
