'use client';

import Image from 'next/image';
import { FormEvent, useState } from 'react';

export default function AdminAccessPage() {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!password) return;
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/access', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password }),
      });
      const result = await response.json() as { error?: string };
      if (!response.ok) {
        setError(result.error || 'ไม่สามารถเข้าสู่โหมดผู้ดูแลได้');
        setPassword('');
        return;
      }
      const params = new URLSearchParams(window.location.search);
      const requestedPath = params.get('returnTo');
      const destination = requestedPath?.startsWith('/admin/') && requestedPath !== '/admin/access'
        ? requestedPath
        : '/admin/dashboard';
      window.location.replace(destination);
    } catch {
      setError('เชื่อมต่อระบบไม่สำเร็จ กรุณาลองใหม่');
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-linear-to-br from-pink-50 via-white to-rose-100/60 px-4 py-10 text-slate-800">
      <div className="absolute -left-24 top-10 h-72 w-72 rounded-full bg-pink-200/30 blur-3xl" />
      <div className="absolute -right-24 bottom-10 h-80 w-80 rounded-full bg-rose-200/30 blur-3xl" />
      <div className="relative w-full max-w-md overflow-hidden rounded-3xl border border-pink-100 bg-white shadow-2xl shadow-pink-200/50">
        <div className="bg-linear-to-r from-pink-600 via-pink-500 to-rose-500 px-7 py-7 text-white">
          <div className="flex items-center gap-4">
            <div className="relative h-14 w-14 overflow-hidden rounded-2xl border-2 border-white/50 bg-white shadow-lg"><Image src="/logo.png" alt="Aemori" fill sizes="56px" className="object-cover" priority /></div>
            <div><p className="text-xl font-black">Aemori Admin</p><p className="mt-1 text-sm font-semibold text-pink-100">พื้นที่สำหรับผู้ดูแลระบบ</p></div>
          </div>
        </div>
        <form onSubmit={handleSubmit} className="space-y-5 p-7">
          <div><h1 className="text-xl font-black text-slate-800">เข้าสู่โหมดผู้ดูแล</h1><p className="mt-1.5 text-sm font-semibold leading-relaxed text-slate-500">กรอกรหัสกลางที่ได้รับจากผู้ดูแลหลัก Session จะใช้งานได้ 8 ชั่วโมง</p></div>
          <div>
            <label htmlFor="admin-password" className="mb-2 block text-xs font-black uppercase tracking-widest text-pink-500">รหัสผู้ดูแล</label>
            <div className="relative"><input id="admin-password" type={showPassword ? 'text' : 'password'} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" autoFocus className="h-12 w-full rounded-xl border border-pink-200 bg-pink-50/50 px-4 pr-14 text-sm font-bold text-slate-700 outline-none transition-all focus:border-pink-400 focus:ring-4 focus:ring-pink-100" placeholder="กรอกรหัสผู้ดูแล" /><button type="button" onClick={() => setShowPassword((value) => !value)} className="absolute inset-y-0 right-0 px-4 text-xs font-bold text-pink-500">{showPassword ? 'ซ่อน' : 'แสดง'}</button></div>
          </div>
          {error && <div role="alert" className="rounded-xl border border-rose-100 bg-rose-50 px-4 py-3 text-sm font-bold text-rose-600">⚠️ {error}</div>}
          <button type="submit" disabled={loading || !password} className="flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-linear-to-r from-pink-500 to-rose-500 text-sm font-black text-white shadow-lg shadow-pink-200 transition-all hover:from-pink-600 hover:to-rose-600 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50">{loading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />กำลังตรวจสอบ...</> : 'เข้าสู่ระบบผู้ดูแล →'}</button>
          <a href="/requisition" className="block text-center text-xs font-bold text-slate-500 hover:text-pink-600">← กลับไปหน้าเบิกสินค้า</a>
        </form>
      </div>
    </main>
  );
}
