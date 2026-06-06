'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7));
  const [selectedItem, setSelectedItem] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<{name: string, unit: string}[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: branchesData } = await supabase.from('branches').select('name');
      const { data: itemsData } = await supabase.from('items').select('name, unit, price');
      
      const { data: rawData } = await supabase
        .from('requisition_details')
        .select(`
          quantity,
          price_at_time,
          requisitions (branch_name, created_at, status),
          items (name, unit)
        `)
        .eq('requisitions.status', 'approved');

      if (branchesData) setAllBranches(branchesData.map(b => b.name));
      if (itemsData) {
        const uniqueItems = Array.from(
          new Map(itemsData.map(i => [`${i.name}-${i.unit}`, { name: i.name, unit: i.unit }])).values()
        );
        setAllItems(uniqueItems);
      }
      if (rawData) setData(rawData.filter(d => d.requisitions && d.items));
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredData = data.filter(d => d.requisitions.created_at.startsWith(selectedDate));
  
  const getDetails = (branch: string, itemName: string) => {
    const records = filteredData.filter(d => d.requisitions.branch_name === branch && d.items.name === itemName);
    const qty = records.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const total = records.reduce((sum, d) => sum + (d.quantity * (d.price_at_time || 0)), 0);
    return { qty, total };
  };

  const getBranchTotal = (branch: string) => {
    return filteredData
      .filter(d => d.requisitions.branch_name === branch)
      .reduce((sum, d) => sum + (d.quantity * (d.price_at_time || 0)), 0);
  };

  const getTotalByItem = (itemName: string) => {
    const records = filteredData.filter(d => d.items.name === itemName);
    const qty = records.reduce((sum, d) => sum + (d.quantity || 0), 0);
    const total = records.reduce((sum, d) => sum + (d.quantity * (d.price_at_time || 0)), 0);
    return { qty, total };
  };

  const totalBudget = filteredData.reduce((sum, d) => sum + (d.quantity * (d.price_at_time || 0)), 0);

  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
      <div className="flex flex-col items-center gap-3">
        <div className="w-10 h-10 rounded-full border-4 border-pink-200 border-t-pink-500 animate-spin" />
        <p className="text-pink-400 font-bold text-sm tracking-wide">กำลังประมวลผลข้อมูล...</p>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50/30 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">
        
        {/* ================= Navbar / Header ================= */}
        <div className="bg-white border border-pink-100 rounded-2xl p-4 sm:p-5 shadow-sm shadow-pink-100/50 flex flex-col sm:flex-row items-center justify-between gap-4 relative overflow-hidden">
          {/* decorative blobs */}
          <div className="absolute -top-6 -right-6 w-28 h-28 bg-pink-200/20 rounded-full blur-2xl pointer-events-none" />
          <div className="absolute -bottom-4 left-16 w-20 h-20 bg-rose-200/20 rounded-full blur-2xl pointer-events-none" />
          
          <div className="flex items-center gap-3.5">
            <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-pink-400 to-rose-500 flex items-center justify-center text-xl text-white shadow-md shadow-pink-400/30 shrink-0">
              🎀
            </div>
            <div>
              <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-800 leading-tight">Aemori</h1>
              <p className="text-[10px] font-bold text-pink-400 mt-0.5 uppercase tracking-widest">ระบบจัดการเบิกของ Aemori</p>
            </div>
          </div>
          
          {/* Nav pills */}
          <nav className="flex items-center gap-1 text-[11px] font-bold bg-pink-50 p-1 rounded-xl border border-pink-100/80">
            <Link href="/admin/dashboard" className="bg-white text-pink-600 shadow-sm shadow-pink-100 px-3.5 py-2 rounded-lg transition-all">📊 แดชบอร์ดรวม</Link>
            <Link href="/admin/requisitions" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📝 จัดการใบเบิก</Link>
            <Link href="/admin/reports" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📈 รายงาน</Link>
            <Link href="/admin/inventory" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📦 คลัง</Link>
          </nav>
        </div>

        {/* ================= Page Header ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100">
          <div>
            {/* ส่วน Header */}
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h1 className="text-lg font-black text-slate-800 tracking-tight">📊 แดชบอร์ด</h1>
                  <p className="text-[10px] font-bold text-pink-400 mt-1 uppercase tracking-widest">ภาพรวมการเบอกสินค้าในแต่ละสาขา</p>
                </div>

                {/* ส่วน Control Panel */}
                <div className="flex items-center gap-3">
                  {/* Input เดือน */}
                  <div className="flex items-center gap-2">
                    <label className="text-[10px] font-black text-pink-300 uppercase tracking-widest hidden sm:block">เดือน</label>
                    <input 
                      type="month" 
                      value={selectedDate} 
                      onChange={(e) => setSelectedDate(e.target.value)} 
                      className="h-9 px-3 border border-pink-100 rounded-xl bg-pink-50/50 text-xs font-bold text-slate-600 w-full sm:w-36 outline-none cursor-pointer focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 transition-all" 
                    />
                  </div>

                  {/* ตรงนี้พี่ชายสามารถเอาปุ่ม Excel หรือ PDF มาวางต่อได้เลยครับ มันจะเรียงกันสวยๆ */}
                </div>
              </div>
            </div>
          <div className="flex items-center gap-2">
            <label className="text-[10px] font-black text-pink-300 uppercase tracking-widest hidden sm:block">สินค้า</label>
            <select 
              value={selectedItem} 
              onChange={(e) => setSelectedItem(e.target.value)} 
              className="h-9 px-3 border border-pink-100 rounded-xl bg-pink-50/50 text-xs font-bold text-slate-600 w-44 outline-none cursor-pointer focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 transition-all"
            >
              <option value="">— ทุกสินค้า —</option>
              {allItems.map((item, index) => <option key={index} value={item.name}>{item.name}</option>)}
            </select>
          </div>

          {/* Budget badge */}
          <div className="ml-auto flex items-center gap-2.5 bg-gradient-to-r from-pink-500 to-rose-400 px-4 py-2.5 rounded-xl shadow-md shadow-pink-300/30">
            <span className="text-pink-200 text-[10px] font-bold uppercase tracking-wider">งบรวมทั้งสิ้น</span>
            <span className="text-white font-black text-sm tracking-tight">{totalBudget.toLocaleString()} ฿</span>
          </div>
        </div>

        {/* ================= Data Table ================= */}
        <div className="bg-white rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-xs border-separate" style={{ borderSpacing: 0 }}>
              <thead>
                <tr>
                  <th className="p-4 border-b-2 border-r border-pink-100 text-left font-black text-pink-400 uppercase tracking-wider sticky left-0 bg-pink-50/80 z-20 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.1)] min-w-[150px]">
                    🏬 สาขา
                  </th>
                  {allItems.map((item, index) => (
                    <th key={index} className={`p-4 border-b-2 border-r border-pink-100 min-w-[130px] text-center font-black text-pink-400 uppercase tracking-wide bg-pink-50/80 ${selectedItem && selectedItem !== item.name ? 'hidden' : ''}`}>
                      <span className="block">{item.name}</span>
                      <span className="text-[9px] text-pink-300 font-bold normal-case tracking-normal">({item.unit})</span>
                    </th>
                  ))}
                  <th className="p-4 border-b-2 border-pink-100 text-right font-black text-pink-400 uppercase tracking-wider min-w-[130px] bg-pink-50/80">
                    รวมสาขา
                  </th>
                </tr>
              </thead>
              <tbody>
                {allBranches.map((branch, branchIdx) => (
                  <tr key={branch} className={`group transition-colors hover:bg-pink-50/60 ${branchIdx % 2 === 0 ? 'bg-white' : 'bg-pink-50/20'}`}>
                    <td className="p-4 font-black text-slate-700 whitespace-nowrap sticky left-0 z-10 border-r border-pink-100/60 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.08)] transition-colors group-hover:bg-pink-50/60" style={{backgroundColor: branchIdx % 2 === 0 ? 'white' : undefined}}>
                      <div className="flex items-center gap-2">
                        <span className="w-1.5 h-1.5 rounded-full bg-pink-300 shrink-0" />
                        {branch}
                      </div>
                    </td>
                    {allItems.map((item, index) => {
                      if (selectedItem && selectedItem !== item.name) return null;
                      const { qty, total } = getDetails(branch, item.name);
                      return (
                        <td key={index} className="p-3 text-center border-r border-pink-50 min-w-[130px]">
                          {qty > 0 ? (
                            <div className="inline-flex flex-col items-center gap-0.5">
                              <span className="font-black text-pink-600 text-sm leading-none">
                                {qty} <span className="text-[9px] font-medium text-pink-400">{item.unit}</span>
                              </span>
                              <span className="text-[10px] text-pink-400 font-bold bg-pink-50 border border-pink-100 px-1.5 py-0.5 rounded-md mt-0.5">
                                {total.toLocaleString()} ฿
                              </span>
                            </div>
                          ) : <span className="text-slate-200 text-lg">·</span>}
                        </td>
                      );
                    })}
                    <td className="p-4 font-black text-right text-slate-700 min-w-[130px]">
                      {getBranchTotal(branch) > 0 ? (
                        <span className="text-pink-600">{getBranchTotal(branch).toLocaleString()} <span className="text-pink-400 font-bold text-[10px]">฿</span></span>
                      ) : <span className="text-slate-300">—</span>}
                    </td>
                  </tr>
                ))}

                {/* Grand total row */}
                <tr className="bg-gradient-to-r from-pink-600 to-rose-500 text-white">
                  <td className="p-4 font-black text-sm sticky left-0 bg-pink-600 z-10 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.15)]">
                    <div className="flex items-center gap-2">
                      <span className="text-pink-300">Σ</span> รวมทั้งหมด
                    </div>
                  </td>
                  {allItems.map((item, index) => {
                    if (selectedItem && selectedItem !== item.name) return null;
                    const { qty, total } = getTotalByItem(item.name);
                    return (
                      <td key={index} className="p-3 text-center border-r border-pink-500/50 min-w-[130px]">
                        <div className="inline-flex flex-col items-center gap-0.5">
                          <span className="font-black text-white text-sm leading-none">
                            {qty} <span className="text-[9px] font-medium text-pink-200">{item.unit}</span>
                          </span>
                          <span className="text-[10px] text-pink-200 font-bold">
                            {total.toLocaleString()} ฿
                          </span>
                        </div>
                      </td>
                    );
                  })}
                  <td className="p-4 font-black text-right text-white text-sm min-w-[130px]">
                    {totalBudget.toLocaleString()} ฿
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  );
}