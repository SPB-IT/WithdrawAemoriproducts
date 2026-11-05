'use client';

import { useParams } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import CameraCapture from '@/components/stock-request/CameraCapture';
import { ErrorState, InlineError, LoadingState, PhotoThumb, Spinner } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber, uploadPhoto } from '@/lib/stock-request/client';

type PickState = 'picked' | 'partial' | 'missing' | 'substitute';

interface PickItem {
  id: string;
  product_name: string;
  product_code: string;
  replaced: string | null;
  stock_on_hand: number | null;
  sent_qty: number | null;
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

type Choice = { state: PickState | null; note: string; qty: string; subName: string; subCode: string; photo: Blob | null };
const EMPTY_CHOICE: Choice = { state: null, note: '', qty: '', subName: '', subCode: '', photo: null };

const NAME_KEY = 'sr_picker_names'; // ชื่อเดียวกับหน้าแพ็คของของแอดมิน
const MISSING_REASONS = ['ของหมด', 'หาไม่เจอ', 'ของเสีย/ชำรุด'];
const SUBSTITUTE_REASONS = ['ของหมด ใช้รุ่นใกล้เคียง', 'ใช้สีหรือลายอื่น', 'ใช้ขนาดอื่น'];
const PARTIAL_REASONS = ['ของในคลังไม่พอ', 'ของเสียบางส่วน', 'รอของเข้าเพิ่ม'];

// หน้าลิงก์หยิบของ (เปิดจากลิงก์ที่แอดมินส่งให้ ไม่ต้องเข้าระบบ): เดินหยิบของ → กด ✓ หยิบได้ครบ / ⚠️ ได้ไม่ครบ / 🔄 ใช้ของแทน / ✗ ไม่มี → บันทึก
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
      setChoices(Object.fromEntries(result.items.map((item) => [item.id, { ...EMPTY_CHOICE, state: item.state, note: item.note ?? '', qty: item.sent_qty !== null ? String(item.sent_qty) : '' }])));
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
        if (choice.state === 'substitute') return true; // ใช้ของแทน = บันทึกใหม่ทุกครั้ง
        if (choice.state === 'partial') return choice.state !== item.state || choice.qty !== String(item.sent_qty ?? '') || choice.note.trim() !== (item.note ?? '');
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
      return {
        picked: sum.picked + (state === 'picked' || state === 'substitute' ? 1 : 0),
        partial: sum.partial + (state === 'partial' ? 1 : 0),
        missing: sum.missing + (state === 'missing' ? 1 : 0),
      };
    },
    { picked: 0, partial: 0, missing: 0 },
  );
  const pending = data.items.length - counts.picked - counts.partial - counts.missing;

  const setChoice = (itemId: string, patch: Partial<Choice>) => {
    setSaved(null);
    setChoices((current) => ({ ...current, [itemId]: { ...(current[itemId] ?? EMPTY_CHOICE), ...patch } }));
  };

  const save = async () => {
    const picker = name.trim();
    if (!picker) return setError('กรุณาใส่ชื่อผู้หยิบของก่อนบันทึก');
    const noNote = changes.find((item) => choices[item.id]?.state === 'missing' && !choices[item.id]?.note.trim());
    if (noNote) return setError(`กรุณาระบุหมายเหตุของ “${noNote.product_name}” ว่าทำไมไม่มี`);
    const badSub = changes.find((item) => {
      const choice = choices[item.id];
      return choice?.state === 'substitute' && (!choice.subName.trim() || !choice.subCode.trim() || !choice.note.trim());
    });
    if (badSub) return setError(`กรุณาใส่ชื่อ รหัส และเหตุผลของสินค้าที่ใช้แทน “${badSub.product_name}”`);
    const badPartial = changes.find((item) => {
      const choice = choices[item.id];
      const qty = Number(choice?.qty);
      return choice?.state === 'partial' && (!choice.qty || qty < 1 || qty >= (item.stock_on_hand ?? 0) || !choice.note.trim());
    });
    if (badPartial)
      return setError(`“${badPartial.product_name}” ใส่จำนวนที่หยิบได้ (1 ถึง ${(badPartial.stock_on_hand ?? 1) - 1} ชิ้น) และเหตุผลที่ได้ไม่ครบ`);
    setSaving(true);
    setError(null);
    try {
      try {
        localStorage.setItem(NAME_KEY, JSON.stringify([picker, ...recentNames.filter((item) => item !== picker)].slice(0, 8)));
      } catch {
        // บันทึกชื่อในเครื่องไม่ได้ก็ไม่เป็นไร
      }
      // อัปโหลดรูปสินค้าทดแทน (ถ้ามี) ก่อนบันทึก
      const items = [];
      for (const item of changes) {
        const choice = choices[item.id];
        const photoPath = choice.state === 'substitute' && choice.photo ? await uploadPhoto(`/api/pick/${encodeURIComponent(token)}/upload-url`, choice.photo) : null;
        items.push({
          itemId: item.id,
          state: choice.state,
          note: choice.note.trim(),
          qty: choice.state === 'partial' ? Number(choice.qty) : null,
          productName: choice.subName.trim(),
          productCode: choice.subCode.trim(),
          photoPath,
        });
      }
      const result = await apiFetch<{ picked: number; partial: number; missing: number; substituted: number }>(`/api/pick/${encodeURIComponent(token)}`, {
        method: 'POST',
        json: { pickerName: picker, items },
      });
      setSaved(`บันทึกแล้ว · หยิบได้ครบ ${result.picked} · ได้ไม่ครบ ${result.partial} · ใช้ของแทน ${result.substituted} · ไม่มี ${result.missing} รายการ`);
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
        <div className="mt-3 grid grid-cols-4 gap-1.5 text-center">
          <div className="rounded-xl bg-emerald-50 py-2">
            <p className="text-lg font-black text-emerald-700">{counts.picked}</p>
            <p className="text-[11px] font-bold text-emerald-700">หยิบได้ครบ</p>
          </div>
          <div className="rounded-xl bg-amber-50 py-2">
            <p className="text-lg font-black text-amber-700">{counts.partial}</p>
            <p className="text-[11px] font-bold text-amber-700">ได้ไม่ครบ</p>
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
          const choice = choices[item.id] ?? EMPTY_CHOICE;
          const tone =
            choice.state === 'picked'
              ? 'border-emerald-300'
              : choice.state === 'partial'
                ? 'border-amber-300'
                : choice.state === 'substitute'
                  ? 'border-sky-300'
                  : choice.state === 'missing'
                    ? 'border-rose-300'
                    : 'border-transparent';
          return (
            <li key={item.id} className={`rounded-3xl border-2 bg-white p-3.5 shadow-sm transition ${tone}`}>
              <div className="flex items-center gap-3">
                <PhotoThumb url={item.photo_url} alt={item.product_name} className="h-16 w-16" />
                <div className="min-w-0 flex-1">
                  <p className="text-[11px] font-bold text-slate-400">รายการที่ {index + 1}</p>
                  <p className="text-base font-black leading-snug text-slate-800">{item.product_name}</p>
                  <p className="font-mono text-xs text-slate-400">{item.product_code}</p>
                  {item.replaced && <p className="text-[11px] font-bold text-sky-700">ใช้แทน {item.replaced}</p>}
                </div>
                <div className="flex shrink-0 flex-col items-center rounded-2xl bg-pink-50 px-3 py-1.5 text-pink-700">
                  <span className="text-[10px] font-bold">ต้องหยิบ</span>
                  <span className="text-2xl font-black leading-none">{formatNumber(item.stock_on_hand)}</span>
                  <span className="text-[10px] font-bold">ชิ้น</span>
                </div>
              </div>

              {/* ปุ่มหลัก: ส่วนใหญ่หยิบได้ครบ แตะครั้งเดียว */}
              <button
                type="button"
                aria-pressed={choice.state === 'picked'}
                onClick={() => setChoice(item.id, { state: choice.state === 'picked' ? null : 'picked' })}
                className={`mt-3 w-full rounded-2xl py-3.5 text-base font-black transition ${
                  choice.state === 'picked' ? 'bg-emerald-500 text-white shadow-md' : 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200 active:bg-emerald-100'
                }`}
              >
                {choice.state === 'picked' ? '✓ หยิบครบแล้ว' : `✓ หยิบครบ ${formatNumber(item.stock_on_hand)} ชิ้น`}
              </button>

              {/* กรณีอื่น: ปุ่มเล็ก */}
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {(
                  [
                    { state: 'partial', label: 'ได้ไม่ครบ', on: 'bg-amber-500 text-white', off: 'text-amber-700 ring-amber-200', disabled: (item.stock_on_hand ?? 0) < 2 },
                    { state: 'substitute', label: 'ใช้ของแทน', on: 'bg-sky-500 text-white', off: 'text-sky-700 ring-sky-200', disabled: false },
                    { state: 'missing', label: 'ไม่มีของ', on: 'bg-rose-500 text-white', off: 'text-rose-600 ring-rose-200', disabled: false },
                  ] as const
                ).map((option) => {
                  const active = choice.state === option.state;
                  return (
                    <button
                      key={option.state}
                      type="button"
                      aria-pressed={active}
                      disabled={option.disabled}
                      onClick={() =>
                        setChoice(item.id, {
                          state: active ? null : option.state,
                          note: active ? choice.note : item.state === option.state ? item.note ?? '' : '',
                          qty: option.state === 'partial' && !choice.qty ? String(Math.max(1, (item.stock_on_hand ?? 2) - 1)) : choice.qty,
                        })
                      }
                      className={`rounded-xl py-2 text-xs font-bold transition disabled:opacity-30 ${active ? `${option.on} shadow` : `bg-white ring-1 ${option.off}`}`}
                    >
                      {option.label}
                    </button>
                  );
                })}
              </div>
              {choice.state === 'partial' && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-white p-2.5 ring-1 ring-amber-200">
                  <p className="text-center text-xs font-black text-amber-700">ของไม่พอ หยิบได้จริงกี่ชิ้น</p>
                  <div className="flex items-center justify-center gap-3">
                    <button
                      type="button"
                      aria-label="ลดจำนวน"
                      disabled={Number(choice.qty) <= 1}
                      onClick={() => setChoice(item.id, { qty: String(Math.max(1, Number(choice.qty) - 1)) })}
                      className="h-11 w-11 rounded-full bg-amber-100 text-xl font-black text-amber-800 disabled:opacity-30"
                    >
                      −
                    </button>
                    <input
                      value={choice.qty}
                      onChange={(event) => setChoice(item.id, { qty: event.target.value.replace(/[^0-9]/g, '') })}
                      inputMode="numeric"
                      aria-label={`จำนวนที่หยิบได้ของ ${item.product_name}`}
                      className="w-16 rounded-xl border border-amber-200 bg-white py-2 text-center text-2xl font-black text-amber-800 outline-none focus:border-amber-400"
                    />
                    <button
                      type="button"
                      aria-label="เพิ่มจำนวน"
                      disabled={Number(choice.qty) >= (item.stock_on_hand ?? 0) - 1}
                      onClick={() => setChoice(item.id, { qty: String(Math.min((item.stock_on_hand ?? 2) - 1, Number(choice.qty) + 1)) })}
                      className="h-11 w-11 rounded-full bg-amber-100 text-xl font-black text-amber-800 disabled:opacity-30"
                    >
                      +
                    </button>
                  </div>
                  <p className="text-center text-xs font-bold text-amber-700">
                    หยิบได้ {choice.qty || 0} จาก {formatNumber(item.stock_on_hand)} ชิ้น
                    {choice.qty && Number(choice.qty) < (item.stock_on_hand ?? 0) ? ` · ขาด ${(item.stock_on_hand ?? 0) - Number(choice.qty)}` : ''}
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {PARTIAL_REASONS.map((reason) => (
                      <button key={reason} type="button" onClick={() => setChoice(item.id, { note: reason })} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 ring-1 ring-amber-200">
                        {reason}
                      </button>
                    ))}
                  </div>
                  <input
                    value={choice.note}
                    onChange={(event) => setChoice(item.id, { note: event.target.value })}
                    maxLength={300}
                    placeholder="เหตุผลที่ได้ไม่ครบ (บังคับ)"
                    className="w-full rounded-xl border border-amber-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-400"
                  />
                </div>
              )}
              {choice.state === 'substitute' && (
                <div className="mt-2 space-y-1.5 rounded-xl bg-white p-2.5 ring-1 ring-sky-200">
                  <p className="text-xs font-black text-sky-700">สินค้าที่หยิบไปแทน</p>
                  <div className="grid grid-cols-2 gap-1.5">
                    <input
                      value={choice.subName}
                      onChange={(event) => setChoice(item.id, { subName: event.target.value })}
                      maxLength={200}
                      placeholder="ชื่อสินค้าที่ใช้แทน *"
                      className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                    <input
                      value={choice.subCode}
                      onChange={(event) => setChoice(item.id, { subCode: event.target.value })}
                      maxLength={100}
                      placeholder="รหัสสินค้า *"
                      className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                    />
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {SUBSTITUTE_REASONS.map((reason) => (
                      <button key={reason} type="button" onClick={() => setChoice(item.id, { note: reason })} className="rounded-full bg-white px-3 py-1 text-xs font-bold text-sky-700 ring-1 ring-sky-200">
                        {reason}
                      </button>
                    ))}
                  </div>
                  <input
                    value={choice.note}
                    onChange={(event) => setChoice(item.id, { note: event.target.value })}
                    maxLength={300}
                    placeholder="เหตุผลที่ใช้ของแทน (บังคับ)"
                    className="w-full rounded-xl border border-sky-200 bg-white px-3 py-2 text-sm outline-none focus:border-sky-400"
                  />
                  <p className="text-[11px] font-bold text-slate-500">รูปสินค้าที่ใช้แทน (ไม่บังคับ)</p>
                  <CameraCapture value={choice.photo} onChange={(photo) => setChoice(item.id, { photo })} />
                </div>
              )}
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
