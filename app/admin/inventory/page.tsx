'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import AdminNav from '../components/AdminNav';

interface InventoryItem {
  id: string;
  product_code: string;
  name: string;
  unit: string;
  price: number;
  is_active: boolean;
  image_url: string;
}

export default function AdminInventoryPage() {
  const [items, setItems] = useState<InventoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [formData, setFormData] = useState({
    product_code: '',
    name: '',
    unit: '',
    price: 0,
    is_active: true,
    image_url: '',
  });
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'active' | 'inactive'>('all');
  const [sortBy, setSortBy] = useState<'name' | 'price-asc' | 'price-desc' | 'code'>('name');
  const [isBranchModalOpen, setIsBranchModalOpen] = useState(false);
  const [newBranchName, setNewBranchName] = useState('');

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 25;

  const indexOfLastItem = currentPage * itemsPerPage;
  const indexOfFirstItem = indexOfLastItem - itemsPerPage;
  
  // เพิ่ม State สำหรับจัดการสาขา
  const [allBranches, setAllBranches] = useState<{ id: string, name: string }[]>([]);

  async function fetchInventory() {
    setLoading(true);
    setLoadError('');
    let timeoutId = 0;

    try {
      const inventoryRequest = supabase
        .from('items')
        .select('*')
        .order('name');
      const requestTimeout = new Promise<never>((_, reject) => {
        timeoutId = window.setTimeout(
          () => reject(new Error('INVENTORY_REQUEST_TIMEOUT')),
          12000,
        );
      });
      const { data, error } = await Promise.race([inventoryRequest, requestTimeout]);

      if (error) throw error;
      setItems(data ?? []);
    } catch (error) {
      const message = error instanceof Error && error.message === 'INVENTORY_REQUEST_TIMEOUT'
        ? 'เชื่อมต่อฐานข้อมูลนานเกินไป กรุณาตรวจสอบอินเทอร์เน็ตแล้วลองใหม่'
        : error instanceof Error
          ? error.message
          : 'ไม่สามารถโหลดข้อมูลคลังสินค้าได้';
      console.error('Error fetching inventory:', error);
      setLoadError(message);
    } finally {
      window.clearTimeout(timeoutId);
      setLoading(false);
    }
  }

  // ฟังก์ชันดึงสาขา
  async function fetchBranches() {
    const { data } = await supabase.from('branches').select('*').order('name');
    if (data) setAllBranches(data);
  }

  useEffect(() => {
    fetchInventory();
    fetchBranches();
  }, []);

  // ฟังก์ชันลบสาขา
  const deleteBranch = async (id: string) => {
    if (!window.confirm('ยืนยันการลบสาขานี้?')) return;
    const { error } = await supabase.from('branches').delete().eq('id', id);
    if (error) { alert('ลบสาขาไม่สำเร็จ: ' + error.message); return; }
    fetchBranches();
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images')
      .upload(filePath, file);

    if (uploadError) {
      alert('อัปโหลดรูปไม่สำเร็จ กรุณาลองใหม่อีกครั้ง');
    } else {
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setFormData((prev) => ({ ...prev, image_url: data.publicUrl }));
    }
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSave = async () => {
    if (!formData.name.trim()) {
      alert('กรุณากรอกชื่อสินค้า');
      return;
    }
    if (!formData.unit.trim()) {
      alert('กรุณากรอกหน่วยนับ');
      return;
    }
    if (Number(formData.price) < 0) { alert('ราคาสินค้าต้องไม่ติดลบ'); return; }
    const normalizedCode = formData.product_code.trim().toLowerCase();
    if (normalizedCode && items.some((item) => item.id !== editingItem?.id && (item.product_code || '').trim().toLowerCase() === normalizedCode)) {
      alert('รหัสสินค้านี้มีอยู่ในระบบแล้ว');
      return;
    }

    const dataToSave = {
      product_code: formData.product_code.trim(),
      name: formData.name.trim(),
      unit: formData.unit.trim(),
      price: Number(formData.price) || 0,
      is_active: formData.is_active,
      image_url: formData.image_url,
    };

    if (editingItem?.id) {
      const { error } = await supabase.from('items').update(dataToSave).eq('id', editingItem.id);
      if (error) { alert('บันทึกไม่สำเร็จ: ' + error.message); return; }
    } else {
      const { error } = await supabase.from('items').insert(dataToSave);
      if (error) { alert('เพิ่มสินค้าไม่สำเร็จ: ' + error.message); return; }
    }

    setEditingItem(null);
    setFormData({ product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
    await fetchInventory();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบสินค้านี้? หากสินค้าเคยถูกเบิก อาจทำให้ประวัติและรายงานอ้างอิงรายการไม่ได้ แนะนำให้ปิดใช้งานแทน')) return;
    const { error } = await supabase.from('items').delete().eq('id', id);
    if (error) { alert('ลบไม่สำเร็จ: ' + error.message); return; }
    fetchInventory();
  };

  const toggleItemStatus = async (item: InventoryItem) => {
    setItems((prev) => prev.map((row) => row.id === item.id ? { ...row, is_active: !row.is_active } : row));
    const { error } = await supabase.from('items').update({ is_active: !item.is_active }).eq('id', item.id);
    if (error) {
      setItems((prev) => prev.map((row) => row.id === item.id ? item : row));
      alert('เปลี่ยนสถานะไม่สำเร็จ: ' + error.message);
    }
  };

  const handleAddBranch = async () => {
    if (!newBranchName.trim()) { alert('กรุณากรอกชื่อสาขา'); return; }
    const { error } = await supabase.from('branches').insert([{ name: newBranchName.trim() }]);
    if (error) { alert('เพิ่มสาขาไม่สำเร็จ: ' + error.message); return; }
    setNewBranchName('');
    fetchBranches();
    alert('เพิ่มสาขาเรียบร้อยแล้ว');
  };

  const filteredItems = items.filter(
    (item) =>
      (item.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.product_code || '').toLowerCase().includes(searchTerm.toLowerCase())) &&
      (statusFilter === 'all' || (statusFilter === 'active' ? item.is_active : !item.is_active))
  ).sort((a, b) => {
    if (sortBy === 'price-asc') return a.price - b.price;
    if (sortBy === 'price-desc') return b.price - a.price;
    if (sortBy === 'code') return (a.product_code || '').localeCompare(b.product_code || '', 'th');
    return a.name.localeCompare(b.name, 'th');
  });

  const currentItems = filteredItems.slice(indexOfFirstItem, indexOfLastItem);
  const totalPages = Math.ceil(filteredItems.length / itemsPerPage);

  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm]);

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin" />
          <p className="text-pink-400 font-bold text-base">กำลังโหลดข้อมูลคลังสินค้า...</p>
        </div>
      </div>
    );

  if (loadError)
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50/40 px-4">
        <div className="w-full max-w-md rounded-2xl border border-rose-100 bg-white p-7 text-center shadow-xl shadow-pink-100/60">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-rose-50 text-2xl">⚠️</div>
          <h1 className="mt-4 text-lg font-black text-slate-800">โหลดข้อมูลคลังสินค้าไม่สำเร็จ</h1>
          <p className="mt-2 text-sm font-semibold leading-relaxed text-slate-500">{loadError}</p>
          <button
            type="button"
            onClick={fetchInventory}
            className="mt-5 h-11 w-full rounded-xl bg-linear-to-r from-pink-500 to-rose-400 text-sm font-black text-white shadow-md shadow-pink-200 transition-all hover:from-pink-600 hover:to-rose-500 active:scale-[0.98]"
          >
            ↻ ลองโหลดอีกครั้ง
          </button>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-linear-to-br from-pink-50 via-white to-rose-50/30 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">

        <AdminNav />

        <div className="space-y-4 rounded-2xl border border-pink-100 bg-white p-5 shadow-sm shadow-pink-100/50">
          <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div className="min-w-0 flex-1">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">📦 คลังสินค้า</h1>
            <p className="mt-1 text-xs font-semibold uppercase tracking-widest text-pink-500">จัดการรายการสินค้าและสาขา · พบ {filteredItems.length} รายการ</p>
          </div>
          <div className="flex shrink-0 gap-2">
            <button
              onClick={() => setIsBranchModalOpen(true)}
              className="inline-flex items-center gap-2 bg-white border border-pink-200 text-pink-500 px-4 py-2.5 rounded-xl text-sm font-bold hover:bg-pink-50 shadow-sm transition-all active:scale-95"
            >
              🏬 จัดการสาขา
            </button>
            <button
              onClick={() => {
                setEditingItem({ id: '', product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
                setFormData({ product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
              }}
              className="inline-flex items-center gap-2 bg-linear-to-r from-pink-500 to-rose-400 text-white px-4 py-2.5 rounded-xl text-sm font-bold hover:from-pink-600 hover:to-rose-500 shadow-md shadow-pink-200/50 transition-all active:scale-95"
            >
              + เพิ่มสินค้า
            </button>
          </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-[1fr_180px_180px]">
            <input type="text" placeholder="🔍 ค้นหาชื่อสินค้าหรือรหัส..." value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} className="h-11 rounded-xl border border-pink-100 bg-pink-50/60 px-4 text-sm font-medium text-slate-700 outline-none focus:border-pink-300 focus:ring-2 focus:ring-pink-200" />
            <select value={statusFilter} onChange={(e) => { setStatusFilter(e.target.value as typeof statusFilter); setCurrentPage(1); }} className="h-11 rounded-xl border border-pink-100 bg-white px-3 text-sm font-bold text-slate-600 outline-none">
              <option value="all">ทุกสถานะ</option><option value="active">เปิดใช้งาน</option><option value="inactive">ปิดใช้งาน</option>
            </select>
            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as typeof sortBy)} className="h-11 rounded-xl border border-pink-100 bg-white px-3 text-sm font-bold text-slate-600 outline-none">
              <option value="name">เรียงตามชื่อ</option><option value="code">เรียงตามรหัส</option><option value="price-asc">ราคาน้อยไปมาก</option><option value="price-desc">ราคามากไปน้อย</option>
            </select>
          </div>
        </div>

        {/* ── Branch Modal (อัปเดตใหม่) ── */}
        {isBranchModalOpen && (
          <div className="fixed inset-0 bg-pink-900/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl border border-pink-100 space-y-4 max-h-[80vh] overflow-y-auto">
              <h3 className="font-black text-base text-slate-800">🏬 จัดการสาขา</h3>
              <div className="flex gap-2">
                <input
                  placeholder="ชื่อสาขาใหม่..."
                  value={newBranchName}
                  onChange={(e) => setNewBranchName(e.target.value)}
                  className="flex-1 border border-pink-100 bg-pink-50/30 px-4 py-2 rounded-xl text-sm outline-none"
                />
                <button onClick={handleAddBranch} className="bg-pink-500 text-white px-4 py-2 rounded-xl text-sm font-bold">เพิ่ม</button>
              </div>
              <div className="space-y-2 pt-2 border-t">
                {allBranches.map((b) => (
                  <div key={b.id} className="flex items-center justify-between bg-pink-50/50 p-3 rounded-xl">
                    <span className="text-sm font-bold text-slate-700">{b.name}</span>
                    <button onClick={() => deleteBranch(b.id)} className="text-rose-500 text-xs font-bold hover:bg-rose-100 px-3 py-1.5 rounded-lg transition-all">ลบ</button>
                  </div>
                ))}
              </div>
              <button onClick={() => setIsBranchModalOpen(false)} className="w-full py-2.5 bg-slate-100 text-slate-600 rounded-xl text-sm font-bold mt-2">ปิด</button>
            </div>
          </div>
        )}

        <div className="bg-white rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 overflow-hidden">
          <div className="grid gap-3 p-3 md:hidden">
            {currentItems.length === 0 ? <p className="py-16 text-center text-sm font-bold text-slate-400">ไม่พบสินค้า</p> : currentItems.map((item) => (
              <article key={`mobile-${item.id}`} className="rounded-2xl border border-pink-100 bg-white p-4 shadow-sm">
                <div className="flex gap-3"><div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-pink-100 bg-pink-50">{item.image_url ? <img src={item.image_url} alt={item.name} className="h-full w-full object-cover" /> : <span className="flex h-full items-center justify-center text-xl">📦</span>}</div><div className="min-w-0 flex-1"><p className="font-black text-slate-800">{item.name}</p><p className="mt-1 text-xs font-semibold text-slate-500">{item.product_code || 'ไม่มีรหัส'} · {item.unit}</p><p className="mt-1 font-black text-pink-600">{item.price.toLocaleString('th-TH')} ฿</p></div></div>
                <div className="mt-4 flex items-center justify-between gap-2"><button type="button" onClick={() => toggleItemStatus(item)} className={`rounded-lg px-3 py-2 text-xs font-bold ${item.is_active ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'}`}>{item.is_active ? '● เปิดใช้งาน' : '○ ปิดใช้งาน'}</button><div className="flex gap-2"><button onClick={() => { setEditingItem(item); setFormData(item); }} className="rounded-lg border border-pink-200 px-3 py-2 text-xs font-bold text-pink-600">แก้ไข</button><button onClick={() => handleDelete(item.id)} className="rounded-lg border border-rose-200 px-3 py-2 text-xs font-bold text-rose-600">ลบ</button></div></div>
              </article>
            ))}
          </div>
          <div className="hidden overflow-x-auto md:block">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-pink-50/80 border-b border-pink-100">
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider">รูปภาพ</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider">รหัสสินค้า</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider">ชื่อสินค้า</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider text-center">หน่วยนับ</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider text-right">ราคา / หน่วย</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider text-center">สถานะ</th>
                  <th className="p-4 font-black text-pink-400 uppercase tracking-wider text-center">จัดการ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-pink-50">
                {currentItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="py-24 text-center text-pink-300 font-bold text-sm tracking-wide">
                      <div className="flex flex-col items-center gap-2">
                        <span className="text-3xl">📦</span>
                        {searchTerm ? `ไม่พบรายการ "${searchTerm}"` : 'ยังไม่มีสินค้าในระบบ'}
                      </div>
                    </td>
                  </tr>
                ) : (
                  currentItems.map((item, idx) => (
                    <tr 
                      key={item.id} 
                      className={`group transition-all ${idx % 2 === 1 ? 'bg-pink-50/20' : 'bg-white'} hover:bg-pink-50/60`}
                    >
                      <td className="p-4">
                        {item.image_url ? (
                          <div className="relative w-12 h-12 rounded-xl overflow-hidden border border-pink-100 shadow-sm cursor-pointer hover:ring-2 hover:ring-pink-200 transition-all">
                            <img
                              src={item.image_url}
                              alt={item.name}
                              className="w-full h-full object-cover"
                              onClick={() => setSelectedImage(item.image_url)}
                            />
                          </div>
                        ) : (
                          <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center text-[10px] text-pink-300 font-bold border border-pink-100 border-dashed">
                            ไม่มีรูป
                          </div>
                        )}
                      </td>
                      <td className="p-4 font-mono text-xs font-semibold text-slate-400">{item.product_code || '—'}</td>
                      <td className="p-4">
                        <p className="font-bold text-slate-800 text-sm">{item.name}</p>
                      </td>
                      <td className="p-4 text-center">
                        <span className="inline-block bg-pink-50 text-pink-600 px-3 py-1 rounded-lg text-xs font-bold">
                          {item.unit}
                        </span>
                      </td>
                      <td className="p-4 text-right font-black text-slate-700">
                        {(item.price ?? 0).toLocaleString()} 
                        <span className="ml-1 text-[10px] text-pink-400 font-bold">฿</span>
                      </td>
                      <td className="p-4 text-center">
                        <button type="button" onClick={() => toggleItemStatus(item)} aria-pressed={item.is_active} className={`inline-flex min-w-28 items-center gap-2.5 rounded-full border px-3 py-1.5 text-xs font-bold transition-all ${item.is_active ? 'border-emerald-200 bg-emerald-50 text-emerald-700' : 'border-slate-200 bg-slate-50 text-slate-500'}`}>
                          <span className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${item.is_active ? 'bg-emerald-400' : 'bg-slate-300'}`}>
                            <span className={`absolute left-0.5 top-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ${item.is_active ? 'translate-x-5' : 'translate-x-0'}`} />
                          </span>
                          <span className="whitespace-nowrap">{item.is_active ? 'เปิดใช้งาน' : 'ปิดใช้งาน'}</span>
                        </button>
                      </td>
                      <td className="p-4">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => { setEditingItem(item); setFormData(item); }}
                            className="text-xs font-bold text-pink-500 hover:text-white hover:bg-pink-500 border border-pink-200 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          >
                            แก้ไข
                          </button>
                          <button
                            onClick={() => handleDelete(item.id)}
                            className="text-xs font-bold text-rose-500 hover:text-white hover:bg-rose-500 border border-rose-200 px-3 py-1.5 rounded-lg transition-all active:scale-95"
                          >
                            ลบ
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
            {totalPages > 1 && (
              <div className="px-5 py-4 bg-white border-t border-pink-100 flex items-center justify-between">
                <span className="text-xs font-bold text-slate-500">
                  หน้า {currentPage} จาก {totalPages} ({filteredItems.length} รายการ)
                </span>
                <div className="flex gap-2">
                  <button
                    disabled={currentPage === 1}
                    onClick={() => setCurrentPage(prev => prev - 1)}
                    className="px-4 py-2 bg-pink-50 text-pink-600 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-pink-100"
                  >
                    ก่อนหน้า
                  </button>
                  <button
                    disabled={currentPage === totalPages}
                    onClick={() => setCurrentPage(prev => prev + 1)}
                    className="px-4 py-2 bg-pink-50 text-pink-600 rounded-xl text-xs font-bold disabled:opacity-50 hover:bg-pink-100"
                  >
                    ถัดไป
                  </button>
                </div>
              </div>
              )}
            </div>
         </div>
        {selectedImage && (
          <div
            className="fixed inset-0 z-60 flex items-center justify-center p-4 bg-pink-900/40 backdrop-blur-sm cursor-pointer"
            onClick={() => setSelectedImage(null)}
          >
            <img src={selectedImage} alt="Preview" className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border-4 border-white" />
          </div>
        )}

        {editingItem && (
          <div className="fixed inset-0 bg-pink-900/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl shadow-pink-200/50 border border-pink-100 space-y-4 max-h-[90vh] overflow-y-auto">
              <div className="flex items-center gap-3 pb-3 border-b border-pink-50">
                <div className="w-9 h-9 rounded-xl bg-linear-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white shadow-sm text-base">
                  {editingItem.id ? '✏️' : '✨'}
                </div>
                <h3 className="font-black text-base text-slate-800">{editingItem.id ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
              </div>
              <div className="space-y-4">
                <div className="space-y-2">
                  <label className="text-xs font-black text-pink-400 uppercase tracking-widest">รูปภาพสินค้า</label>
                  <div className="flex items-center gap-3">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                    <button
                      type="button"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={uploading}
                      className="px-4 py-2 bg-pink-50 text-pink-600 rounded-xl text-sm font-bold border border-pink-100 hover:bg-pink-100 transition-all disabled:opacity-60"
                    >
                      {uploading ? '⏳ กำลังอัปโหลด...' : '📷 เลือกรูปภาพ'}
                    </button>
                    {formData.image_url && (
                      <button type="button" onClick={() => setFormData((prev) => ({ ...prev, image_url: '' }))} className="text-xs text-rose-400 hover:text-rose-600 font-bold">ลบรูป</button>
                    )}
                  </div>
                  {formData.image_url && (
                    <img src={formData.image_url} alt="preview" className="w-20 h-20 object-cover rounded-xl border border-pink-100 shadow-sm" />
                  )}
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-pink-400 uppercase tracking-widest">รหัสสินค้า</label>
                  <input
                    placeholder="เช่น PRD-001"
                    value={formData.product_code || ''}
                    onChange={(e) => setFormData({ ...formData, product_code: e.target.value })}
                    className="w-full border border-pink-100 bg-pink-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-pink-400 uppercase tracking-widest">ชื่อสินค้า <span className="text-rose-400">*</span></label>
                  <input
                    placeholder="ชื่อสินค้า"
                    value={formData.name || ''}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    className="w-full border border-pink-100 bg-pink-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-pink-400 uppercase tracking-widest">หน่วยนับ <span className="text-rose-400">*</span></label>
                  <input
                    placeholder="เช่น ชิ้น, กล่อง, แผ่น"
                    value={formData.unit || ''}
                    onChange={(e) => setFormData({ ...formData, unit: e.target.value })}
                    className="w-full border border-pink-100 bg-pink-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-xs font-black text-pink-400 uppercase tracking-widest">ราคาต่อหน่วย (฿)</label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    placeholder="0.00"
                    value={formData.price || ''}
                    onChange={(e) => setFormData({ ...formData, price: parseFloat(e.target.value) || 0 })}
                    className="w-full border border-pink-100 bg-pink-50/30 px-4 py-3 rounded-xl text-sm font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all"
                  />
                </div>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-pink-50/40 hover:bg-pink-50 border border-pink-100/60 rounded-xl transition-all">
                  <input
                    type="checkbox"
                    checked={formData.is_active}
                    onChange={(e) => setFormData({ ...formData, is_active: e.target.checked })}
                    className="h-5 w-5 accent-pink-500 rounded"
                  />
                  <div>
                    <span className="text-sm font-bold text-slate-700">เปิดใช้งานรายการนี้</span>
                    <p className="text-xs text-slate-400 mt-0.5">สินค้าจะแสดงในหน้าเบิกของสาขา</p>
                  </div>
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => { setEditingItem(null); }} className="flex-1 py-3 bg-pink-50 text-pink-400 border border-pink-100 rounded-xl font-bold text-sm hover:bg-pink-100 transition-all">ยกเลิก</button>
                <button onClick={handleSave} disabled={uploading} className="flex-1 py-3 bg-linear-to-r from-pink-500 to-rose-400 text-white rounded-xl font-black text-sm hover:from-pink-600 hover:to-rose-500 shadow-md shadow-pink-200 transition-all disabled:opacity-60">บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
