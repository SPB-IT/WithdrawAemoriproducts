'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

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
  const [uploading, setUploading] = useState(false);
  const [editingItem, setEditingItem] = useState<InventoryItem | null>(null);
  const [selectedImage, setSelectedImage] = useState<string | null>(null); // เพิ่ม state นี้
  const [formData, setFormData] = useState({ 
    product_code: '', 
    name: '', 
    unit: '', 
    price: 0, 
    is_active: true, 
    image_url: '' 
  });
  const fileInputRef = useRef<HTMLInputElement>(null);

  async function fetchInventory() {
    setLoading(true);
    const { data, error } = await supabase.from('items').select('*').order('name');
    if (data) setItems(data);
    setLoading(false);
  }

  useEffect(() => {
    fetchInventory();
  }, []);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    const fileExt = file.name.split('.').pop();
    const fileName = `${Math.random()}.${fileExt}`;
    const filePath = `products/${fileName}`;

    const { error: uploadError } = await supabase.storage
      .from('product-images') 
      .upload(filePath, file);

    if (uploadError) {
      alert('อัปโหลดรูปไม่สำเร็จครับพี่ชาย');
    } else {
      const { data } = supabase.storage.from('product-images').getPublicUrl(filePath);
      setFormData({ ...formData, image_url: data.publicUrl });
    }
    setUploading(false);
  };

  const handleSave = async () => {
    const dataToSave = {
      product_code: formData.product_code,
      name: formData.name,
      unit: formData.unit,
      price: formData.price,
      is_active: formData.is_active,
      image_url: formData.image_url,
    };

    if (editingItem?.id) {
      await supabase.from('items').update(dataToSave).eq('id', editingItem.id);
    } else {
      await supabase.from('items').insert(dataToSave);
    }
    
    setEditingItem(null);
    setFormData({ product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: '' });
    await fetchInventory();
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('ยืนยันการลบรายการนี้ใช่ไหมครับพี่ชาย?')) return;
    await supabase.from('items').delete().eq('id', id);
    fetchInventory();
  };

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin" />
        <p className="text-pink-400 font-bold text-sm">กำลังโหลดข้อมูลคลังสินค้า...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50/30 py-8 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">
        
        <div className="bg-white px-5 py-4 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-3.5">
              <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-xl text-white shadow-md shadow-pink-400/30 shrink-0">
                🎀
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-800 leading-tight">Aemori</h1>
                <p className="text-[10px] font-bold text-pink-400 mt-0.5 uppercase tracking-widest">ระบบจัดการเบิกของ Aemori</p>
              </div>
            </div>
          </div>
          <nav className="flex items-center gap-1 text-[11px] font-bold bg-pink-50 p-1 rounded-xl border border-pink-100/80">
            <Link href="/admin/dashboard" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📊 แดชบอร์ดรวม</Link>
            <Link href="/admin/requisitions" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📝 จัดการใบเบิก</Link>
            <Link href="/admin/reports" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📈 รายงานสรุปยอด</Link>
            <Link href="/admin/inventory" className="bg-white text-pink-600 shadow-sm shadow-pink-100 px-3.5 py-2 rounded-lg transition-all">📦 คลังสินค้า</Link>
          </nav>
        </div>

        <div className="flex items-center justify-between bg-white p-5 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100">
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight">📦 รายการสินค้าในคลัง</h1>
            <p className="text-[10px] font-black text-pink-400 mt-0.5 uppercase tracking-widest">Inventory Management</p>
          </div>
          <button 
            onClick={() => { 
              setEditingItem({id: '', product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: ''}); 
              setFormData({product_code: '', name: '', unit: '', price: 0, is_active: true, image_url: ''}); 
            }}
            className="inline-flex items-center gap-1.5 bg-gradient-to-r from-pink-500 to-rose-400 text-white px-4 py-2.5 rounded-xl text-xs font-black hover:from-pink-600 hover:to-rose-500 shadow-md shadow-pink-200/50 transition-all active:scale-95"
          >
            + เพิ่มสินค้าใหม่
          </button>
        </div>

        <div className="bg-white rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 overflow-hidden">
          <table className="w-full text-xs text-left">
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
              {items.map((item, idx) => (
                <tr key={item.id} className={`hover:bg-pink-50/50 transition-colors group ${idx % 2 === 1 ? 'bg-pink-50/20' : 'bg-white'}`}>
                  <td className="p-4">
                    {item.image_url ? (
                      <img 
                        src={item.image_url} 
                        alt={item.name} 
                        className="w-10 h-10 object-cover rounded-lg border border-pink-100 shadow-sm cursor-pointer hover:opacity-80 transition-all"
                        onClick={() => setSelectedImage(item.image_url)}
                      />
                    ) : (
                      <div className="w-10 h-10 bg-pink-50 rounded-lg flex items-center justify-center text-[8px] text-pink-300 font-bold">ไม่มีรูป</div>
                    )}
                  </td>
                  <td className="p-4 font-bold text-slate-500">{item.product_code}</td>
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <span className="w-1.5 h-1.5 rounded-full bg-pink-200 shrink-0" />
                      <span className="font-black text-slate-700">{item.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-center">
                    <span className="bg-pink-50 text-pink-500 border border-pink-100 px-2.5 py-1 rounded-lg font-bold">{item.unit}</span>
                  </td>
                  <td className="p-4 text-right font-black text-slate-700">
                    {(item.price ?? 0).toLocaleString()} <span className="text-pink-400 font-bold">฿</span>
                  </td>
                  <td className="p-4 text-center">
                    <span className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full font-black text-[10px] border ${item.is_active ? 'bg-emerald-50 text-emerald-600 border-emerald-100' : 'bg-pink-50 text-pink-400 border-pink-100'}`}>
                      <span className={`w-1.5 h-1.5 rounded-full ${item.is_active ? 'bg-emerald-400' : 'bg-pink-300'}`} />
                      {item.is_active ? 'ใช้งาน' : 'ปิดใช้งาน'}
                    </span>
                  </td>
                  <td className="p-4 text-center">
                    <div className="flex items-center justify-center gap-2">
                      <button onClick={() => { setEditingItem(item); setFormData(item); }} className="text-xs font-black text-pink-500 hover:text-pink-700 bg-pink-50 hover:bg-pink-100 border border-pink-100 px-3 py-1.5 rounded-lg transition-all">แก้ไข</button>
                      <button onClick={() => handleDelete(item.id)} className="text-xs font-black text-rose-500 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-100 px-3 py-1.5 rounded-lg transition-all">ลบ</button>
                    </div>
                  </td>
                </tr>
              ))}
              {items.length === 0 && (
                <tr>
                  <td colSpan={7} className="py-12 text-center text-pink-300 font-bold text-sm">ยังไม่มีสินค้าในคลัง</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Modal ขยายรูป */}
        {selectedImage && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-pink-900/40 backdrop-blur-sm" onClick={() => setSelectedImage(null)}>
            <img src={selectedImage} alt="Preview" className="max-w-[90vw] max-h-[90vh] rounded-2xl shadow-2xl border-4 border-white" />
          </div>
        )}

        {editingItem && (
          <div className="fixed inset-0 bg-pink-900/20 backdrop-blur-sm flex items-center justify-center p-4 z-50">
            {/* ส่วน Modal แก้ไขข้อมูลคงเดิม */}
            <div className="bg-white p-6 rounded-2xl w-full max-w-sm shadow-2xl shadow-pink-200/50 border border-pink-100 space-y-4">
              <div className="flex items-center gap-3 pb-3 border-b border-pink-50">
                <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-white text-sm shadow-sm">
                  {editingItem.id ? '✏️' : '✨'}
                </div>
                <div>
                  <h3 className="font-black text-sm text-slate-800">{editingItem.id ? 'แก้ไขข้อมูลสินค้า' : 'เพิ่มสินค้าใหม่'}</h3>
                </div>
              </div>
              <div className="space-y-3">
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest">รูปภาพสินค้า</label>
                  <div className="flex items-center gap-2">
                    <input type="file" ref={fileInputRef} className="hidden" onChange={handleFileUpload} accept="image/*" />
                    <button type="button" onClick={() => fileInputRef.current?.click()} className="px-3 py-2 bg-pink-50 text-pink-600 rounded-lg text-[10px] font-bold border border-pink-100">
                      {uploading ? 'กำลังอัปโหลด...' : 'เลือกไฟล์รูป'}
                    </button>
                    <span className="text-[10px] text-slate-400 truncate w-32">{formData.image_url ? 'มีรูปแล้ว' : 'ยังไม่มีรูป'}</span>
                  </div>
                  {formData.image_url && <img src={formData.image_url} alt="preview" className="w-16 h-16 object-cover rounded-lg mt-2" />}
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest">รหัสสินค้า</label>
                  <input placeholder="รหัสสินค้า" value={formData.product_code || ''} onChange={e => setFormData({...formData, product_code: e.target.value})} className="w-full border border-pink-100 bg-pink-50/30 p-2.5 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all placeholder:text-slate-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest">ชื่อสินค้า</label>
                  <input placeholder="ชื่อสินค้า" value={formData.name || ''} onChange={e => setFormData({...formData, name: e.target.value})} className="w-full border border-pink-100 bg-pink-50/30 p-2.5 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all placeholder:text-slate-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest">หน่วยนับ</label>
                  <input placeholder="เช่น ชิ้น, กล่อง, แผ่น" value={formData.unit || ''} onChange={e => setFormData({...formData, unit: e.target.value})} className="w-full border border-pink-100 bg-pink-50/30 p-2.5 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all placeholder:text-slate-300" />
                </div>
                <div className="space-y-1">
                  <label className="text-[10px] font-black text-pink-400 uppercase tracking-widest">ราคาต่อหน่วย (฿)</label>
                  <input type="number" placeholder="0" value={formData.price || ''} onChange={e => setFormData({...formData, price: Number(e.target.value)})} className="w-full border border-pink-100 bg-pink-50/30 p-2.5 rounded-xl text-xs font-medium text-slate-700 outline-none focus:ring-2 focus:ring-pink-200 focus:border-pink-300 transition-all placeholder:text-slate-300" />
                </div>
                <label className="flex items-center gap-3 cursor-pointer p-3 bg-pink-50/40 hover:bg-pink-50 border border-pink-100/60 rounded-xl transition-all">
                  <input type="checkbox" checked={formData.is_active} onChange={e => setFormData({...formData, is_active: e.target.checked})} className="h-4 w-4 accent-pink-500" />
                  <div>
                    <span className="text-xs font-black text-slate-700">เปิดใช้งานรายการนี้</span>
                  </div>
                </label>
              </div>
              <div className="flex gap-2 pt-1">
                <button onClick={() => setEditingItem(null)} className="flex-1 p-2.5 bg-pink-50 text-pink-400 border border-pink-100 rounded-xl font-bold text-xs hover:bg-pink-100 transition-all">ยกเลิก</button>
                <button onClick={handleSave} className="flex-1 p-2.5 bg-gradient-to-r from-pink-500 to-rose-400 text-white rounded-xl font-black text-xs hover:from-pink-600 hover:to-rose-500 shadow-md shadow-pink-200 transition-all">บันทึกข้อมูล</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}