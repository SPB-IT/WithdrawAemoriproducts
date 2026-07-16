'use client';

import { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import AdminNav from '../components/AdminNav';
import Link from 'next/link';

export default function DashboardPage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().slice(0, 7));
  const [selectedItem, setSelectedItem] = useState('');
  const [data, setData] = useState<any[]>([]);
  const [allBranches, setAllBranches] = useState<string[]>([]);
  const [allItems, setAllItems] = useState<{ name: string; unit: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingLatest, setPendingLatest] = useState<{ id: string; branch_name: string; requester_name: string; created_at: string }[]>([]);
  const [pendingTotal, setPendingTotal] = useState(0);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);

  useEffect(() => {
    async function fetchData() {
      setLoading(true);
      const { data: branchesData } = await supabase.from('branches').select('name').order('name');
      const { data: itemsData } = await supabase.from('items').select('name, unit, price').order('name');

      const { data: rawData } = await supabase
        .from('requisition_details')
        .select(`
          quantity,
          price_at_time,
          requisitions (branch_name, created_at, status),
          items (name, unit)
        `);
      const { data: pendingData, count: pendingCount } = await supabase.from('requisitions').select('id, branch_name, requester_name, created_at', { count: 'exact' }).eq('status', 'pending').order('created_at', { ascending: false }).limit(5);

      if (branchesData) setAllBranches(branchesData.map((b) => b.name));
      if (itemsData) {
        const uniqueItems = Array.from(
          new Map(itemsData.map((i) => [`${i.name}-${i.unit}`, { name: i.name, unit: i.unit }])).values()
        );
        setAllItems(uniqueItems);
      }
      // กรองเฉพาะ approved และ join ครบ
      if (rawData) {
        setData(
          rawData.filter(
            (d: any) =>
              d.requisitions &&
              d.items &&
              d.requisitions.status === 'approved'
          )
        );
      }
      setPendingLatest(pendingData ?? []);
      setPendingTotal(pendingCount ?? 0);
      setLastUpdated(new Date());
      setLoading(false);
    }
    fetchData();
  }, []);

  const filteredData = data.filter((d) =>
    d.requisitions.created_at?.startsWith(selectedDate)
  );

  const getDetails = (branch: string, itemName: string) => {
    const records = filteredData.filter(
      (d) => d.requisitions.branch_name === branch && d.items.name === itemName
    );
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce(
      (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
      0
    );
    return { qty, total };
  };

  const getBranchTotal = (branch: string) =>
    filteredData
      .filter((d) => d.requisitions.branch_name === branch)
      .reduce((sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0), 0);

  const getTotalByItem = (itemName: string) => {
    const records = filteredData.filter((d) => d.items.name === itemName);
    const qty = records.reduce((sum: number, d: any) => sum + (d.quantity || 0), 0);
    const total = records.reduce(
      (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
      0
    );
    return { qty, total };
  };

  const totalBudget = filteredData.reduce(
    (sum: number, d: any) => sum + (d.quantity || 0) * (d.price_at_time || 0),
    0
  );
  const totalQuantity = filteredData.reduce((sum: number, row: any) => sum + (row.quantity || 0), 0);
  const activeBranchCount = new Set(filteredData.map((row) => row.requisitions.branch_name)).size;
  const dailyTotals = Array.from({ length: 7 }, (_, offset) => {
    const day = new Date();
    day.setDate(day.getDate() - (6 - offset));
    const key = day.toISOString().slice(0, 10);
    return { key, label: day.toLocaleDateString('th-TH', { day: 'numeric', month: 'short' }), total: data.filter((row) => row.requisitions.created_at?.startsWith(key)).reduce((sum: number, row: any) => sum + (row.quantity || 0) * (row.price_at_time || 0), 0) };
  });
  const maxDailyTotal = Math.max(1, ...dailyTotals.map((day) => day.total));

  const displayedItems = selectedItem
    ? allItems.filter((i) => i.name === selectedItem)
    : allItems;

  if (loading)
    return (
      <div className="min-h-screen flex items-center justify-center bg-pink-50/40">
        <div className="flex flex-col items-center gap-3">
          <div className="w-12 h-12 rounded-full border-4 border-pink-200 border-t-pink-500 animate-spin" />
          <p className="text-pink-400 font-bold text-base tracking-wide">กำลังประมวลผลข้อมูล...</p>
        </div>
      </div>
    );

  return (
    <div className="min-h-screen bg-linear-to-br from-pink-50 via-white to-rose-50/30 py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-7xl mx-auto space-y-5">

        {/* ── Navbar ── */}
        <AdminNav />

        {/* ── Header + Filters ── */}
        <div className="bg-white p-5 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex-1">
            <h1 className="text-xl font-black text-slate-800 tracking-tight">📊 แดชบอร์ดภาพรวม</h1>
            <p className="text-xs font-semibold text-pink-400 mt-1 uppercase tracking-widest">สรุปการเบิกสินค้าแต่ละสาขา</p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* เลือกเดือน */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-pink-400 uppercase tracking-wider hidden sm:block">เดือน</label>
              <input
                type="month"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="h-10 px-3 border border-pink-100 rounded-xl bg-pink-50/50 text-sm font-semibold text-slate-700 outline-none cursor-pointer focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 transition-all"
              />
            </div>

            {/* เลือกสินค้า */}
            <div className="flex items-center gap-2">
              <label className="text-xs font-bold text-pink-400 uppercase tracking-wider hidden sm:block">สินค้า</label>
              <select
                value={selectedItem}
                onChange={(e) => setSelectedItem(e.target.value)}
                className="h-10 px-3 border border-pink-100 rounded-xl bg-pink-50/50 text-sm font-semibold text-slate-700 w-44 outline-none cursor-pointer focus:ring-2 focus:ring-pink-300/40 focus:border-pink-300 transition-all"
              >
                <option value="">— ทุกสินค้า —</option>
                {allItems.map((item, i) => (
                  <option key={i} value={item.name}>{item.name}</option>
                ))}
              </select>
            </div>

            {/* ยอดรวม */}
            <div className="flex items-center gap-2.5 bg-linear-to-r from-pink-500 to-rose-400 px-4 py-2.5 rounded-xl shadow-md shadow-pink-300/30 ml-auto sm:ml-0">
              <span className="text-pink-200 text-xs font-bold uppercase tracking-wider">งบรวมทั้งสิ้น</span>
              <span className="text-white font-black text-base">{totalBudget.toLocaleString()} ฿</span>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <Link href="/admin/requisitions" className="rounded-2xl border border-amber-100 bg-amber-50 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs font-black text-amber-700">ใบเบิกรอดำเนินการ</p><p className="mt-2 text-3xl font-black text-slate-800">{pendingTotal}</p><p className="mt-1 text-xs font-semibold text-amber-600">เปิดหน้าตรวจสอบ →</p></Link>
          <Link href="/admin/reports" className="rounded-2xl border border-pink-100 bg-pink-50 p-5 transition-all hover:-translate-y-0.5 hover:shadow-md"><p className="text-xs font-black text-pink-700">จำนวนที่อนุมัติเดือนนี้</p><p className="mt-2 text-3xl font-black text-slate-800">{totalQuantity.toLocaleString('th-TH')}</p><p className="mt-1 text-xs font-semibold text-pink-600">ดูรายงานสินค้า →</p></Link>
          <div className="rounded-2xl border border-emerald-100 bg-emerald-50 p-5"><p className="text-xs font-black text-emerald-700">สาขาที่มีการเบิก</p><p className="mt-2 text-3xl font-black text-slate-800">{activeBranchCount}</p><p className="mt-1 text-xs font-semibold text-emerald-600">จากทั้งหมด {allBranches.length} สาขา</p></div>
        </div>

        <div className="grid gap-5 lg:grid-cols-[1.35fr_1fr]">
          <section className="rounded-2xl border border-pink-100 bg-white p-5 shadow-sm">
            <div className="flex items-center justify-between"><div><h2 className="font-black text-slate-800">แนวโน้มค่าใช้จ่าย 7 วันล่าสุด</h2><p className="mt-1 text-xs font-semibold text-slate-500">ข้อมูลจากใบเบิกที่อนุมัติแล้ว</p></div><p className="text-[11px] font-semibold text-slate-400">{lastUpdated ? `อัปเดต ${lastUpdated.toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })} น.` : ''}</p></div>
            <div className="mt-6 flex h-44 items-end gap-2">
              {dailyTotals.map((day) => <div key={day.key} className="flex min-w-0 flex-1 flex-col items-center gap-2"><span className="text-[10px] font-bold text-slate-500">{day.total > 0 ? day.total.toLocaleString('th-TH') : ''}</span><div className="w-full rounded-t-lg bg-linear-to-t from-pink-500 to-rose-300 transition-all" style={{ height: `${Math.max(4, (day.total / maxDailyTotal) * 115)}px` }} /><span className="whitespace-nowrap text-[10px] font-bold text-slate-500">{day.label}</span></div>)}
            </div>
          </section>
          <section className="rounded-2xl border border-amber-100 bg-white p-5 shadow-sm"><div className="flex items-center justify-between"><h2 className="font-black text-slate-800">ใบเบิกรอล่าสุด</h2><Link href="/admin/requisitions" className="text-xs font-bold text-pink-600">ดูทั้งหมด →</Link></div><div className="mt-4 space-y-2">{pendingLatest.length === 0 ? <p className="py-10 text-center text-sm font-semibold text-slate-400">ไม่มีใบเบิกรอดำเนินการ</p> : pendingLatest.map((req) => <Link key={req.id} href="/admin/requisitions" className="flex items-center justify-between rounded-xl border border-amber-100 bg-amber-50/60 p-3 hover:bg-amber-50"><div className="min-w-0"><p className="truncate text-sm font-black text-slate-700">{req.branch_name}</p><p className="truncate text-xs font-semibold text-slate-500">{req.requester_name}</p></div><span className="text-xs font-bold text-amber-700">ตรวจสอบ →</span></Link>)}</div></section>
        </div>

        {/* ── Table ── */}
        <div className="bg-white rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 overflow-hidden">
          {allBranches.length === 0 || displayedItems.length === 0 ? (
            <div className="py-20 text-center text-pink-300 font-bold text-base">
              ไม่มีข้อมูลในช่วงเวลาที่เลือก
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-separate" style={{ borderSpacing: 0 }}>
                <thead>
                  <tr>
                    <th className="p-4 border-b-2 border-r border-pink-100 text-left font-black text-pink-400 uppercase tracking-wider sticky left-0 bg-pink-50/80 z-20 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.1)] min-w-40">
                      🏬 สาขา
                    </th>
                    {displayedItems.map((item, i) => (
                      <th key={i} className="p-4 border-b-2 border-r border-pink-100 min-w-35 text-center font-black text-pink-400 uppercase tracking-wide bg-pink-50/80">
                        <span className="block">{item.name}</span>
                        <span className="text-xs text-pink-300 font-semibold normal-case tracking-normal">({item.unit})</span>
                      </th>
                    ))}
                    <th className="p-4 border-b-2 border-pink-100 text-right font-black text-pink-400 uppercase tracking-wider min-w-35 bg-pink-50/80">
                      รวมสาขา
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {allBranches.map((branch, branchIdx) => (
                    <tr key={branch} className={`group transition-colors hover:bg-pink-50/60 ${branchIdx % 2 === 0 ? 'bg-white' : 'bg-pink-50/20'}`}>
                      <td
                        className="p-4 font-bold text-slate-700 whitespace-nowrap sticky left-0 z-10 border-r border-pink-100/60 shadow-[2px_0_8px_-2px_rgba(244,114,182,0.08)] transition-colors group-hover:bg-pink-50/60"
                        style={{ backgroundColor: branchIdx % 2 === 0 ? 'white' : 'rgb(253 242 248 / 0.2)' }}
                      >
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full bg-pink-300 shrink-0" />
                          {branch}
                        </div>
                      </td>
                      {displayedItems.map((item, i) => {
                        const { qty, total } = getDetails(branch, item.name);
                        return (
                          <td key={i} className="p-3 text-center border-r border-pink-50 min-w-35">
                            {qty > 0 ? (
                              <div className="inline-flex flex-col items-center gap-1">
                                <span className="font-black text-pink-600 text-base leading-none">
                                  {qty} <span className="text-xs font-semibold text-pink-400">{item.unit}</span>
                                </span>
                                <span className="text-xs text-pink-400 font-bold bg-pink-50 border border-pink-100 px-2 py-0.5 rounded-md">
                                  {total.toLocaleString()} ฿
                                </span>
                              </div>
                            ) : (
                              <span className="text-slate-200 text-xl">·</span>
                            )}
                          </td>
                        );
                      })}
                      <td className="p-4 font-black text-right text-slate-700 min-w-35">
                        {getBranchTotal(branch) > 0 ? (
                          <span className="text-pink-600 text-base">
                            {getBranchTotal(branch).toLocaleString()}{' '}
                            <span className="text-pink-400 font-semibold text-xs">฿</span>
                          </span>
                        ) : (
                          <span className="text-slate-300">—</span>
                        )}
                      </td>
                    </tr>
                  ))}

                  {/* Grand total row */}
                  <tr className="bg-linear-to-r from-pink-600 to-rose-500 text-white">
                    <td className="p-4 font-black text-base sticky left-0 bg-pink-600 z-10 shadow-[2px_0_8px_-2px_rgba(0,0,0,0.15)]">
                      <div className="flex items-center gap-2">
                        <span className="text-pink-300">Σ</span> รวมทั้งหมด
                      </div>
                    </td>
                    {displayedItems.map((item, i) => {
                      const { qty, total } = getTotalByItem(item.name);
                      return (
                        <td key={i} className="p-3 text-center border-r border-pink-500/50 min-w-35">
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="font-black text-white text-base leading-none">
                              {qty} <span className="text-xs font-semibold text-pink-200">{item.unit}</span>
                            </span>
                            <span className="text-xs text-pink-200 font-bold">{total.toLocaleString()} ฿</span>
                          </div>
                        </td>
                      );
                    })}
                    <td className="p-4 font-black text-right text-white text-base min-w-35">
                      {totalBudget.toLocaleString()} ฿
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
