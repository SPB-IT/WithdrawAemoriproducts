'use client';

import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import Link from 'next/link';

interface Requisition {
  id: string;
  created_at: string;
  branch_name: string;
  requester_name: string;
  status: 'pending' | 'approved' | 'rejected';
}

interface RequisitionDetail {
  id: string;
  quantity: number;
  price_at_time: number;
  items: {
    name: string;
    unit: string;
    image_url: string | null;
  } | null;
}

export default function AdminRequisitionsPage() {
  const [requisitions, setRequisitions] = useState<Requisition[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [selectedReq, setSelectedReq] = useState<Requisition | null>(null);
  const [details, setDetails] = useState<RequisitionDetail[]>([]);
  const [loadingDetails, setLoadingDetails] = useState(false);
  const [modalMode, setModalMode] = useState<'review' | 'view'>('review');

  async function fetchRequisitions() {
    setLoading(true);
    const { data, error } = await supabase
      .from('requisitions')
      .select('id, created_at, branch_name, requester_name, status')
      .order('created_at', { ascending: false });

    if (data) setRequisitions(data);
    if (error) console.error('Error fetching requisitions:', error);
    setLoading(false);
  }

  useEffect(() => {
    fetchRequisitions();
  }, []);

  const groupedRequisitions = requisitions.reduce((groups, req) => {
    const date = new Date(req.created_at).toLocaleDateString('th-TH', { 
      day: 'numeric', month: 'long', year: 'numeric' 
    });
    if (!groups[date]) groups[date] = [];
    groups[date].push(req);
    return groups;
  }, {} as Record<string, Requisition[]>);

  const handleViewDetails = async (req: Requisition, mode: 'review' | 'view') => {
    setSelectedReq(req);
    setModalMode(mode);
    setLoadingDetails(true);
    
    const { data, error } = await supabase
      .from('requisition_details')
      .select(`id, quantity, price_at_time, items (name, unit, image_url)`)
      .eq('requisition_id', req.id);

    if (data) setDetails(data as unknown as RequisitionDetail[]);
    setLoadingDetails(false);
  };

  const handleUpdateStatus = async (id: string, newStatus: 'pending' | 'approved' | 'rejected') => {
    const actionLabel = newStatus === 'approved' ? 'อนุมัติ' : newStatus === 'rejected' ? 'ปฏิเสธ' : 'ยกเลิกการอนุมัติ';
    if (!window.confirm(`คุณต้องการ "${actionLabel}" ใบเบิกนี้ใช่หรือไม่ครับพี่ชาย?`)) return;

    const { error } = await supabase
      .from('requisitions')
      .update({ status: newStatus })
      .eq('id', id);

    if (error) {
      alert(`เกิดข้อผิดพลาด: ${error.message}`);
    } else {
      alert('อัปเดตสถานะเรียบร้อยแล้วครับพี่ชาย!');
      setSelectedReq(null);
      fetchRequisitions();
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'approved': return (
        <span className="inline-flex items-center gap-1 bg-emerald-50 text-emerald-600 px-2.5 py-1 rounded-full text-[10px] font-black border border-emerald-100">
          <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />อนุมัติแล้ว
        </span>
      );
      case 'rejected': return (
        <span className="inline-flex items-center gap-1 bg-rose-50 text-rose-500 px-2.5 py-1 rounded-full text-[10px] font-black border border-rose-100">
          <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />ปฏิเสธ
        </span>
      );
      default: return (
        <span className="inline-flex items-center gap-1 bg-amber-50 text-amber-500 px-2.5 py-1 rounded-full text-[10px] font-black border border-amber-100">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />รออนุมัติ
        </span>
      );
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 via-white to-rose-50/30 py-8 px-4 sm:px-6 lg:px-8 text-slate-800">
      <div className="max-w-6xl mx-auto space-y-5">
        
        {/* ================= Navbar ================= */}
        <div className="bg-white px-5 py-4 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 flex flex-col sm:flex-row items-center justify-between gap-4 print:hidden">
          <div className="flex items-center gap-3">
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
          </div>
          <nav className="flex items-center gap-1 text-[11px] font-bold bg-pink-50 p-1 rounded-xl border border-pink-100/80">
            <Link href="/admin/dashboard" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📊 แดชบอร์ดรวม</Link>
            <Link href="/admin/requisitions" className="bg-white text-pink-600 shadow-sm shadow-pink-100 px-3.5 py-2 rounded-lg transition-all">📝 จัดการใบเบิก</Link>
            <Link href="/admin/reports" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📈 รายงาน</Link>
            <Link href="/admin/inventory" className="px-3.5 py-2 rounded-lg text-slate-400 hover:text-pink-500 hover:bg-white/70 transition-all">📦 คลัง</Link>
          </nav>
        </div>

        {/* ================= Page Header ================= */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-white p-5 rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100">
          <div>
            <h1 className="text-lg font-black text-slate-800 tracking-tight">📝 จัดการใบเบิกสินค้า</h1>
            <p className="text-[10px] font-bold text-pink-400 mt-1 uppercase tracking-widest">Admin — ตรวจสอบและอนุมัติ</p>
          </div>
          <button 
            onClick={fetchRequisitions} 
            className="inline-flex items-center gap-1.5 bg-pink-50 text-pink-500 hover:bg-pink-100 border border-pink-100 px-4 py-2 rounded-xl text-xs font-black transition-all"
          >
            <span className="text-sm">🔄</span> รีเฟรชข้อมูล
          </button>
        </div>

        {/* ================= Grouped Requisition Tables ================= */}
        {loading ? (
          <div className="flex flex-col items-center gap-3 py-16">
            <div className="w-8 h-8 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin" />
            <p className="text-pink-400 font-bold text-xs tracking-wide">กำลังโหลดข้อมูล...</p>
          </div>
        ) : (
          Object.entries(groupedRequisitions).map(([date, reqs]) => (
            <div key={date} className="bg-white rounded-2xl shadow-sm shadow-pink-100/50 border border-pink-100 overflow-hidden">
              {/* Date header */}
              <div className="px-5 py-3 bg-gradient-to-r from-pink-50 to-rose-50/50 border-b border-pink-100 flex items-center gap-2">
                <span className="text-pink-300 text-xs">🗓️</span>
                <span className="text-pink-500 font-black text-[11px] uppercase tracking-widest">{date}</span>
                <span className="ml-auto text-[10px] font-bold text-pink-300">{reqs.length} รายการ</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <tbody className="divide-y divide-pink-50/80">
                    {reqs.map((req) => (
                      <tr key={req.id} className="hover:bg-pink-50/40 transition-colors group">
                        <td className="p-4 text-xs font-bold text-slate-300 w-20">
                          {new Date(req.created_at).toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4">
                          <span className="font-black text-slate-700 text-sm">{req.branch_name}</span>
                        </td>
                        <td className="p-4">
                          <span className="text-xs font-bold text-slate-400">{req.requester_name}</span>
                        </td>
                        <td className="p-4">{getStatusBadge(req.status)}</td>
                        <td className="p-4 text-right">
                          {req.status === 'pending' ? (
                            <button 
                              onClick={() => handleViewDetails(req, 'review')} 
                              className="bg-gradient-to-r from-pink-500 to-rose-400 text-white hover:from-pink-600 hover:to-rose-500 px-4 py-1.5 rounded-lg text-xs font-black transition-all shadow-sm shadow-pink-300/30"
                            >
                              ตรวจสอบ →
                            </button>
                          ) : (
                            <button 
                              onClick={() => handleViewDetails(req, 'view')} 
                              className="bg-pink-50 text-pink-400 hover:bg-pink-100 border border-pink-100 px-4 py-1.5 rounded-lg text-xs font-bold transition-all"
                            >
                              {req.status === 'approved' ? '✅ รายละเอียด' : '❌ ดูข้อมูล'}
                            </button>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ================= Modal ================= */}
      {selectedReq && (
        <div className="fixed inset-0 bg-pink-900/20 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl shadow-pink-200/50 overflow-hidden border border-pink-100">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-pink-600 to-rose-500 text-white p-5 flex items-start justify-between">
              <div>
                <h3 className="font-black text-sm tracking-tight">
                  {modalMode === 'review' ? '📋 ตรวจสอบใบเบิก' : '📄 รายละเอียดใบเบิก'}
                </h3>
                <p className="text-[10px] text-pink-200 mt-1 font-bold">
                  {selectedReq.branch_name} · {selectedReq.requester_name}
                </p>
              </div>
              <button 
                onClick={() => setSelectedReq(null)} 
                className="w-7 h-7 rounded-full bg-white/20 hover:bg-white/30 flex items-center justify-center text-white font-bold text-sm transition-all"
              >
                ×
              </button>
            </div>
            
            {/* Modal Body */}
            <div className="p-5 max-h-[60vh] overflow-y-auto">
              {loadingDetails ? (
                <div className="flex justify-center py-6">
                  <div className="w-7 h-7 rounded-full border-4 border-pink-200 border-t-pink-400 animate-spin" />
                </div>
              ) : (
                <div className="space-y-4">
                  {/* ข้อมูลเบื้องต้น */}
                  <div className="grid grid-cols-2 gap-2 text-[11px] font-bold text-slate-500 bg-pink-50 p-3 rounded-xl border border-pink-100">
                    <p>ชื่อผู้เบิก: {selectedReq.requester_name}</p>
                    <p>สาขา: {selectedReq.branch_name}</p>
                    <p>วันที่: {new Date(selectedReq.created_at).toLocaleDateString('th-TH')}</p>
                  </div>

                  {/* ตารางรายการสิ่งของ */}
                  <table className="w-full text-left text-[11px] border-collapse">
                    <thead>
                      <tr className="border-b border-pink-100 text-pink-400">
                        <th className="py-2 px-1">รายการ</th>
                        <th className="py-2 px-1 text-center">จำนวน</th>
                        <th className="py-2 px-1 text-center">หน่วย</th>
                        <th className="py-2 px-1 text-right">ราคา/หน่วย</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-pink-50">
                      {details.map((d) => (
                        <tr key={d.id} className="text-slate-700 hover:bg-pink-50/50">
                          <td className="py-2 px-1 font-bold">{d.items?.name}</td>
                          <td className="py-2 px-1 text-center font-black">{d.quantity}</td>
                          <td className="py-2 px-1 text-center">{d.items?.unit}</td>
                          <td className="py-2 px-1 text-right font-bold text-pink-600">
                            {d.price_at_time?.toLocaleString('th-TH', { minimumFractionDigits: 2 })}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="border-t border-pink-200 font-black text-slate-800">
                        <td colSpan={3} className="py-2 px-1 text-right">รวมเป็นเงินทั้งสิ้น</td>
                        <td className="py-2 px-1 text-right text-pink-600">
                          {details.reduce((sum, d) => sum + (d.price_at_time * d.quantity), 0).toLocaleString('th-TH', { minimumFractionDigits: 2 })} ฿
                        </td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-pink-50/40 border-t border-pink-100 flex gap-2">
              {modalMode === 'review' ? (
                <>
                  <button 
                    onClick={() => handleUpdateStatus(selectedReq.id, 'rejected')} 
                    className="flex-1 border border-pink-200 text-pink-500 p-2.5 rounded-xl text-xs font-black hover:bg-pink-50 transition-all"
                  >
                    ❌ ปฏิเสธ
                  </button>
                  <button 
                    onClick={() => handleUpdateStatus(selectedReq.id, 'approved')} 
                    className="flex-1 bg-gradient-to-r from-pink-500 to-rose-400 text-white p-2.5 rounded-xl text-xs font-black hover:from-pink-600 hover:to-rose-500 transition-all shadow-md shadow-pink-200"
                  >
                    ✅ อนุมัติ
                  </button>
                </>
              ) : selectedReq.status === 'approved' ? (
                <button 
                  onClick={() => handleUpdateStatus(selectedReq.id, 'pending')} 
                  className="w-full bg-amber-400 text-white p-2.5 rounded-xl text-xs font-black hover:bg-amber-500 transition-all"
                >
                  ↩️ ยกเลิกการอนุมัติ
                </button>
              ) : (
                <button 
                  onClick={() => setSelectedReq(null)} 
                  className="w-full bg-pink-50 text-pink-400 border border-pink-100 p-2.5 rounded-xl text-xs font-black hover:bg-pink-100 transition-all"
                >
                  ปิดหน้าต่าง
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}