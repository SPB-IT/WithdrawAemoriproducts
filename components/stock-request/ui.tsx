'use client';

import { useEffect, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { STATUS_LABEL, STATUS_STYLE } from '@/lib/stock-request/constants';
import type { BillStatus } from '@/lib/stock-request/types';

export function StatusBadge({ status, className = '' }: { status: BillStatus; className?: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ring-1 ring-inset ${STATUS_STYLE[status]} ${className}`}>
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {STATUS_LABEL[status]}
    </span>
  );
}

export function Spinner({ className = 'h-5 w-5' }: { className?: string }) {
  return <span className={`inline-block animate-spin rounded-full border-2 border-current border-t-transparent ${className}`} aria-hidden />;
}

export function LoadingState({ label = 'กำลังโหลดข้อมูล...' }: { label?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-16 text-pink-500" role="status">
      <Spinner className="h-8 w-8" />
      <p className="text-sm font-semibold text-slate-500">{label}</p>
    </div>
  );
}

export function EmptyState({ icon = '📭', title, description, action }: { icon?: string; title: string; description?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-2 rounded-2xl border border-dashed border-pink-200 bg-white/60 px-6 py-12 text-center">
      <span className="text-4xl">{icon}</span>
      <p className="text-base font-bold text-slate-700">{title}</p>
      {description && <p className="max-w-sm text-sm text-slate-500">{description}</p>}
      {action && <div className="mt-2">{action}</div>}
    </div>
  );
}

export function ErrorState({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="flex flex-col items-center gap-3 rounded-2xl border border-rose-200 bg-rose-50 px-6 py-10 text-center">
      <span className="text-3xl">⚠️</span>
      <p className="text-sm font-semibold text-rose-700">{message}</p>
      {onRetry && (
        <button type="button" onClick={onRetry} className="rounded-xl bg-white px-4 py-2 text-sm font-bold text-rose-600 ring-1 ring-rose-200 hover:bg-rose-100">
          ลองใหม่
        </button>
      )}
    </div>
  );
}

export function InlineError({ message }: { message: string | null }) {
  if (!message) return null;
  return (
    <div role="alert" className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-sm font-semibold text-rose-700">
      {message}
    </div>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  size = 'md',
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  size?: 'md' | 'lg';
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => event.key === 'Escape' && onClose();
    window.addEventListener('keydown', onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflow;
    };
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 sm:items-center sm:p-4" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-2xl sm:rounded-3xl ${size === 'lg' ? 'sm:max-w-2xl' : 'sm:max-w-lg'}`}
      >
        <div className="flex items-center justify-between border-b border-pink-100 px-5 py-4">
          <h2 className="text-lg font-black text-slate-800">{title}</h2>
          <button type="button" onClick={onClose} className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600" aria-label="ปิด">
            ✕
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="border-t border-pink-100 bg-pink-50/40 px-5 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'ยืนยัน',
  tone = 'primary',
  busy = false,
  onConfirm,
  onCancel,
  children,
}: {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel?: string;
  tone?: 'primary' | 'danger';
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
  children?: ReactNode;
}) {
  return (
    <Modal
      open={open}
      onClose={busy ? () => undefined : onCancel}
      title={title}
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" disabled={busy} onClick={onCancel} className="rounded-xl px-4 py-2.5 text-sm font-bold text-slate-600 hover:bg-slate-100 disabled:opacity-50">
            ยกเลิก
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`inline-flex items-center gap-2 rounded-xl px-5 py-2.5 text-sm font-black text-white shadow-sm disabled:opacity-60 ${tone === 'danger' ? 'bg-rose-500 hover:bg-rose-600' : 'bg-linear-to-r from-pink-500 to-rose-400 hover:opacity-90'}`}
          >
            {busy && <Spinner className="h-4 w-4" />}
            {confirmLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3 text-sm text-slate-600">
        <div>{message}</div>
        {children}
      </div>
    </Modal>
  );
}

export function PhotoThumb({ url, alt, className = 'h-20 w-20' }: { url: string | null; alt: string; className?: string }) {
  const [open, setOpen] = useState(false);
  if (!url) {
    return <div className={`flex shrink-0 items-center justify-center rounded-xl bg-slate-100 text-2xl text-slate-300 ${className}`}>📷</div>;
  }
  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation(); // ไม่ให้ไปกดการ์ดที่อยู่ด้านหลัง (เช่น การ์ดเช็คของ)
          setOpen(true);
        }}
        className={`shrink-0 overflow-hidden rounded-xl bg-slate-100 ring-1 ring-slate-200 ${className}`}
        aria-label={`ดูรูป ${alt}`}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
      </button>
      {open &&
        // แสดงที่ body (portal): ไม่ถูกบีบ/ซ่อนโดยการ์ดที่มี transform, sticky หรือ backdrop-blur
        createPortal(
          <div
            className="fixed inset-0 z-[80] flex items-center justify-center bg-black/85 p-4"
            onClick={(event) => {
              event.stopPropagation(); // portal ยังส่ง event ผ่าน React tree — กันไม่ให้ไปติ๊กการ์ด
              setOpen(false);
            }}
            role="dialog"
            aria-modal="true"
            aria-label={alt}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={url} alt={alt} className="max-h-full max-w-full rounded-xl object-contain" />
            <button type="button" className="absolute right-4 top-4 rounded-full bg-white/20 px-4 py-2 text-sm font-black text-white backdrop-blur" aria-label="ปิดรูป">
              ปิด ✕
            </button>
          </div>,
          document.body,
        )}
    </>
  );
}

export function Field({ label, hint, children, required }: { label: string; hint?: string; children: ReactNode; required?: boolean }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-xs font-bold text-slate-600">
        {label}
        {required && <span className="text-rose-500"> *</span>}
      </span>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

export const inputClass =
  'block w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm font-medium text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-pink-400 focus:ring-4 focus:ring-pink-100 disabled:bg-slate-50';

export const primaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-linear-to-r from-pink-500 to-rose-400 px-4 py-2.5 text-sm font-black text-white shadow-md shadow-pink-200 transition hover:opacity-90 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';

export const secondaryButton =
  'inline-flex items-center justify-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-slate-200 transition hover:bg-slate-50 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50';
