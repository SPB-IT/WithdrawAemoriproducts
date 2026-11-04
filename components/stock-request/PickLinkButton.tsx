'use client';

import { useCallback, useRef, useState } from 'react';
import { apiFetch, errorMessage, formatDateTime } from '@/lib/stock-request/client';
import { InlineError, Modal, Spinner, primaryButton, secondaryButton } from './ui';

interface LinkInfo {
  created_at: string;
  expires_at: string;
  last_saved_at: string | null;
  last_saved_by: string | null;
}

// ปุ่ม "ลิงก์หยิบของ": สร้างลิงก์ของบิลนี้ส่งให้คนเดินหยิบของ (เปิดบนมือถือได้เลย ไม่ต้องใช้รหัสแอดมิน)
// ระบบเก็บแค่ hash ของลิงก์ → ลิงก์แสดงได้ตอนสร้างเท่านั้น ถ้าหายให้สร้างใหม่ (ลิงก์เดิมใช้ไม่ได้ทันที)
export default function PickLinkButton({ billId, billNo, branchName, className = secondaryButton }: { billId: string; billNo: string; branchName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<LinkInfo | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);

  const refresh = useCallback(async () => {
    setActive((await apiFetch<{ link: LinkInfo | null }>(`/admin/stock-request/api/bills/${billId}/pick-link`)).link);
  }, [billId]);

  const openModal = async () => {
    setOpen(true);
    setUrl(null);
    setCopied(false);
    setError(null);
    try {
      await refresh();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  const run = async (action: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await action();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  const create = () =>
    run(async () => {
      const result = await apiFetch<{ url: string; link: LinkInfo }>(`/admin/stock-request/api/bills/${billId}/pick-link`, { method: 'POST' });
      setUrl(result.url);
      setActive(result.link);
      setCopied(false);
    });

  const revoke = () =>
    run(async () => {
      await apiFetch(`/admin/stock-request/api/bills/${billId}/pick-link`, { method: 'DELETE' });
      setUrl(null);
      setActive(null);
    });

  const message = url ? `🛒 หยิบของ ${branchName} (บิล ${billNo})\n${url}` : '';
  // บางเบราว์เซอร์/หน้าต่างฝังไม่ให้เขียนคลิปบอร์ด → ลองวิธีสำรอง แล้วถ้ายังไม่ได้ เลือกลิงก์ให้กดคัดลอกเอง
  const copy = () =>
    run(async () => {
      try {
        await navigator.clipboard.writeText(message);
        setCopied(true);
        return;
      } catch {
        // ใช้วิธีสำรองด้านล่าง
      }
      const area = document.createElement('textarea');
      area.value = message;
      area.setAttribute('readonly', '');
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      const ok = document.execCommand('copy');
      area.remove();
      if (ok) {
        setCopied(true);
        return;
      }
      urlRef.current?.focus();
      urlRef.current?.select();
      throw new Error('เบราว์เซอร์นี้ไม่ให้คัดลอกอัตโนมัติ — เลือกลิงก์ไว้ให้แล้ว กด Ctrl+C (หรือกดค้างแล้วเลือกคัดลอก)');
    });
  // มือถือ: เปิดเมนูแชร์ของเครื่อง (เลือก LINE ได้เลย)
  const share = () =>
    run(async () => {
      try {
        await navigator.share({ title: `หยิบของ ${branchName}`, text: message });
      } catch (err) {
        if (err instanceof Error && err.name === 'AbortError') return;
        throw err;
      }
    });

  return (
    <>
      <button type="button" onClick={openModal} className={className}>
        🔗 ลิงก์หยิบของ
      </button>
      <Modal open={open} onClose={() => setOpen(false)} title="ลิงก์หยิบของ">
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            ส่งลิงก์ให้คนที่จะเดินหยิบของของบิล <b className="font-mono">{billNo}</b> ({branchName}) — เปิดบนมือถือได้เลยไม่ต้องใช้รหัส เห็นเฉพาะบิลนี้ กด ✓ หยิบได้ / ✗ ไม่มี แล้วบันทึก
          </p>

          {url ? (
            <div className="space-y-2 rounded-2xl border border-emerald-200 bg-emerald-50 p-3">
              <p className="text-xs font-black text-emerald-700">✅ สร้างลิงก์แล้ว — คัดลอกหรือแชร์ตอนนี้ (ปิดหน้าต่างแล้วจะดูลิงก์นี้อีกไม่ได้)</p>
              <input ref={urlRef} readOnly value={url} onFocus={(event) => event.target.select()} className="w-full rounded-xl border border-emerald-200 bg-white px-3 py-2 font-mono text-xs text-slate-700" aria-label="ลิงก์หยิบของ" />
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={copy} disabled={busy} className={primaryButton}>
                  {copied ? '✓ คัดลอกแล้ว' : '📋 คัดลอกลิงก์'}
                </button>
                {typeof navigator !== 'undefined' && 'share' in navigator && (
                  <button type="button" onClick={share} disabled={busy} className={secondaryButton}>
                    📤 แชร์ (LINE ฯลฯ)
                  </button>
                )}
              </div>
            </div>
          ) : active ? (
            <div className="rounded-2xl border border-sky-200 bg-sky-50 p-3 text-xs text-sky-800">
              <p className="font-black">🔗 มีลิงก์ที่ใช้งานอยู่</p>
              <p>
                สร้างเมื่อ {formatDateTime(active.created_at)} · ใช้ได้ถึง {formatDateTime(active.expires_at)} (หรือจนกว่าจะจัดส่ง)
              </p>
              <p>{active.last_saved_at ? `บันทึกล่าสุด ${formatDateTime(active.last_saved_at)} โดย ${active.last_saved_by ?? '-'}` : 'ยังไม่มีการบันทึกจากลิงก์นี้'}</p>
            </div>
          ) : (
            <p className="rounded-2xl bg-slate-50 p-3 text-xs text-slate-500">ยังไม่มีลิงก์ของบิลนี้ · ลิงก์ใช้ได้ 24 ชั่วโมง หรือจนกว่าจะจัดส่ง</p>
          )}

          <InlineError message={error} />

          <div className="flex flex-wrap justify-end gap-2 border-t border-pink-50 pt-3">
            {active && (
              <button type="button" onClick={revoke} disabled={busy} className="rounded-xl px-3 py-2 text-xs font-bold text-rose-600 hover:bg-rose-50">
                ยกเลิกลิงก์
              </button>
            )}
            <button type="button" onClick={create} disabled={busy} className={url ? secondaryButton : primaryButton}>
              {busy ? <Spinner className="h-4 w-4" /> : '🔗'} {active ? 'สร้างลิงก์ใหม่ (ลิงก์เดิมใช้ไม่ได้)' : 'สร้างลิงก์'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}
