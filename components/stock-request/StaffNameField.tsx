'use client';

import { useEffect, useState } from 'react';
import { apiFetch } from '@/lib/stock-request/client';
import { SR_RECENT_STAFF_KEY } from '@/lib/stock-request/constants';
import { Field, inputClass } from './ui';

// ชื่อพนักงานกรอกตอนลงรายการ/ยืนยันรับทุกครั้ง — แสดงชื่อที่เคยใช้ในเครื่องนี้ + ชื่อที่สาขานี้เคยลงในระบบ ให้กดเลือกได้เลย

export function readRecentStaff(branchId: number): string[] {
  try {
    const all = JSON.parse(localStorage.getItem(SR_RECENT_STAFF_KEY) ?? '{}') as Record<string, string[]>;
    return Array.isArray(all[branchId]) ? all[branchId] : [];
  } catch {
    return [];
  }
}

export function saveRecentStaff(branchId: number, name: string) {
  try {
    const all = JSON.parse(localStorage.getItem(SR_RECENT_STAFF_KEY) ?? '{}') as Record<string, string[]>;
    all[branchId] = [name, ...(all[branchId] ?? []).filter((item) => item !== name)].slice(0, 8);
    localStorage.setItem(SR_RECENT_STAFF_KEY, JSON.stringify(all));
  } catch {
    // localStorage อาจใช้ไม่ได้ (private mode) — ไม่กระทบการทำงานหลัก
  }
}

/** ชื่อที่สาขานี้เคยลงรายการ/ยืนยันรับในฐานข้อมูล (ทุกเครื่องเห็นเหมือนกัน) — โหลดใหม่ทุกครั้งที่ active */
export function useBranchStaffNames(active: boolean) {
  const [names, setNames] = useState<string[]>([]);
  useEffect(() => {
    if (!active) return;
    let cancelled = false;
    apiFetch<{ names: string[] }>('/api/stock-request/branch/staff-names')
      .then((data) => {
        if (!cancelled) setNames(data.names);
      })
      .catch(() => undefined); // ไม่มีรายชื่อก็ยังพิมพ์เองได้
    return () => {
      cancelled = true;
    };
  }, [active]);
  return names;
}

export default function StaffNameField({
  value,
  onChange,
  recent,
  known = [],
  label = 'ชื่อผู้ลงรายการ',
}: {
  value: string;
  onChange: (value: string) => void;
  recent: string[];
  known?: string[];
  label?: string;
}) {
  // แสดงทุกชื่อที่เคยใช้ (รวมชื่อที่เลือกอยู่ — ไฮไลต์ไว้) กดเลือกได้เลยไม่ต้องพิมพ์
  const names = [...new Set([...recent, ...known])].slice(0, 12);
  const current = value.trim();
  return (
    <Field label={label} required>
      <input value={value} onChange={(event) => onChange(event.target.value)} className={inputClass} maxLength={100} placeholder="ชื่อของคุณ" autoComplete="name" />
      {names.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {names.map((name) => {
            const active = name === current;
            return (
              <button
                key={name}
                type="button"
                onClick={() => onChange(name)}
                aria-pressed={active}
                className={`rounded-full px-3 py-1.5 text-xs font-bold ring-1 transition ${active ? 'bg-pink-500 text-white ring-pink-500' : 'bg-pink-50 text-pink-700 ring-pink-100 hover:bg-pink-100'}`}
              >
                {active ? '✓' : '👤'} {name}
              </button>
            );
          })}
        </div>
      )}
    </Field>
  );
}
