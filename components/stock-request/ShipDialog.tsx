'use client';

import { useEffect, useState } from 'react';
import { errorMessage } from '@/lib/stock-request/client';
import { ConfirmDialog, InlineError, inputClass } from './ui';

const SHIPPER_KEY = 'sr_shipper_names'; // ชื่อผู้จัดส่งที่เคยใช้ในเครื่องนี้

// ยืนยันจัดส่ง — หลังแพ็คของเสร็จ ต้องระบุชื่อผู้ส่ง (บัญชีผู้ดูแลเป็นบัญชีรวม)
// ใช้ร่วมกันในหน้าบิล หน้าเช็คของ และรายการบิลรอเช็คของ · onShip เรียก API เอง
export default function ShipDialog({
  open,
  billNo,
  summary,
  onClose,
  onShip,
}: {
  open: boolean;
  billNo: string;
  summary: string;
  onClose: () => void;
  onShip: (shipperName: string) => Promise<void>;
}) {
  const [name, setName] = useState('');
  const [recent, setRecent] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const timer = setTimeout(() => {
      setError(null);
      try {
        const list = JSON.parse(localStorage.getItem(SHIPPER_KEY) ?? '[]');
        const names = Array.isArray(list) ? list.filter((item): item is string => typeof item === 'string') : [];
        setRecent(names);
        setName(names[0] ?? '');
      } catch {
        setRecent([]);
        setName('');
      }
    }, 0);
    return () => clearTimeout(timer);
  }, [open]);

  const confirm = async () => {
    const shipper = name.trim();
    if (!shipper) return setError('กรุณาระบุชื่อผู้ส่ง');
    setBusy(true);
    setError(null);
    try {
      try {
        localStorage.setItem(SHIPPER_KEY, JSON.stringify([shipper, ...recent.filter((item) => item !== shipper)].slice(0, 8)));
      } catch {
        // ไม่มี localStorage ก็ส่งต่อได้
      }
      await onShip(shipper);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <ConfirmDialog
      open={open}
      title="ยืนยันจัดส่ง"
      confirmLabel="🚚 ยืนยันจัดส่ง"
      busy={busy}
      onCancel={onClose}
      onConfirm={confirm}
      message={`บิล ${billNo} · ${summary} — สาขาจะได้รับแจ้งเตือนให้เช็คของเมื่อได้รับ`}
    >
      <div className="space-y-2">
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
        <input value={name} onChange={(event) => setName(event.target.value)} className={inputClass} maxLength={100} placeholder="ชื่อผู้ส่ง (บังคับ)" />
        <InlineError message={error} />
      </div>
    </ConfirmDialog>
  );
}
