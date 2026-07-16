'use client';

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';

interface Item {
  id: string;
  name: string;
  unit: string;
  image_url: string | null;
}

interface CartItem extends Item {
  quantity: number;
}

interface CartFormContentProps {
  branchName: string;
  setBranchName: (val: string) => void;
  branches: { name: string }[];
  requesterName: string;
  setRequesterName: (val: string) => void;
  handlePreSubmitCheck: (e: React.FormEvent) => void;
  totalCartItems: number;
  cart: CartItem[];
  updateQuantity: (id: string, amount: number) => void;
  removeFromCart: (id: string) => void;
  loading: boolean;
  cartBounce: boolean;
}

const CartFormContent = ({
  branchName,
  setBranchName,
  branches,
  requesterName,
  setRequesterName,
  handlePreSubmitCheck,
  totalCartItems,
  cart,
  updateQuantity,
  removeFromCart,
  loading,
  cartBounce,
}: CartFormContentProps) => (
  <form onSubmit={handlePreSubmitCheck} className="h-full flex flex-col gap-4">
    <div className="space-y-3 overflow-y-auto flex-1 pr-1">
      {/* สาขา */}
      <div>
        <label className="block text-[10px] font-black text-pink-400 uppercase tracking-[0.15em] mb-1.5">
          สาขาที่ขอเบิก
        </label>
        <div className="relative">
          <select
            value={branchName}
            onChange={(e) => setBranchName(e.target.value)}
            className="block w-full py-2.5 pl-3.5 pr-9 bg-white border border-slate-200 hover:border-pink-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-400/15 rounded-xl text-sm font-semibold text-slate-700 outline-none transition-all appearance-none cursor-pointer shadow-sm"
          >
            <option value="">— เลือกสาขา —</option>
            {branches.map((b) => (
              <option key={b.name} value={b.name}>{b.name}</option>
            ))}
          </select>
          <span className="absolute inset-y-0 right-0 flex items-center pr-3.5 pointer-events-none text-pink-300 text-[10px]">▼</span>
        </div>
      </div>

      {/* ชื่อผู้เบิก */}
      <div>
        <label className="block text-[10px] font-black text-pink-400 uppercase tracking-[0.15em] mb-1.5">
          ชื่อผู้เบิกสินค้า
        </label>
        <input
          type="text"
          value={requesterName}
          onChange={(e) => setRequesterName(e.target.value)}
          placeholder="ชื่อ - นามสกุล"
          className="block w-full py-2.5 px-3.5 bg-white border border-slate-200 hover:border-pink-300 focus:border-pink-400 focus:ring-2 focus:ring-pink-400/15 rounded-xl text-sm font-semibold text-slate-700 placeholder:text-slate-300 outline-none transition-all shadow-sm"
        />
      </div>

      {/* Divider */}
      <div className="flex items-center gap-2 py-1">
        <div className="flex-1 h-px bg-slate-100" />
        <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest">รายการที่เลือก</span>
        <div className="flex-1 h-px bg-slate-100" />
      </div>

      {/* Cart badge */}
      <div className="flex items-center justify-between px-1">
        <span className="text-xs font-bold text-slate-500">{cart.length} รายการ</span>
        <span className={`px-2.5 py-1 rounded-full text-xs font-black border transition-all duration-300 ${
          cartBounce
            ? 'scale-110 bg-rose-500 border-rose-400 text-white shadow-md shadow-rose-200'
            : 'bg-pink-50 border-pink-200 text-pink-600'
        }`}>
          {totalCartItems} ชิ้น
        </span>
      </div>

      {/* รายการ */}
      <div className="space-y-2 max-h-64 overflow-y-auto pr-0.5">
        {cart.length === 0 ? (
          <div className="text-center py-8 bg-slate-50 rounded-xl border border-dashed border-slate-200 flex flex-col items-center justify-center gap-2">
            <span className="text-3xl opacity-20">🛒</span>
            <p className="text-slate-400 text-xs font-semibold">ยังไม่มีสินค้าในตะกร้า</p>
          </div>
        ) : (
          cart.map((item) => (
            <div key={item.id} className="flex items-center gap-2.5 bg-white p-2 border border-slate-100 rounded-xl hover:border-pink-100 transition-all group">
              <div className="w-9 h-9 bg-pink-50 rounded-lg shrink-0 flex items-center justify-center overflow-hidden border border-pink-50">
                {item.image_url
                  ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                  : <span className="text-sm">📦</span>}
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-bold text-slate-800 truncate text-xs leading-tight">{item.name}</p>
                <p className="text-[10px] text-pink-400 font-semibold mt-0.5">{item.unit}</p>
              </div>
              <div className="flex items-center bg-slate-50 border border-slate-200/80 rounded-lg shrink-0">
                <button type="button" onClick={() => updateQuantity(item.id, -1)}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-md text-sm font-black transition-all active:scale-90">−</button>
                <span className="w-7 text-center font-black text-xs text-slate-700">{item.quantity}</span>
                <button type="button" onClick={() => updateQuantity(item.id, 1)}
                  className="w-6 h-6 flex items-center justify-center text-slate-400 hover:text-pink-600 hover:bg-pink-50 rounded-md text-sm font-black transition-all active:scale-90">+</button>
              </div>
              <button type="button" onClick={() => removeFromCart(item.id)}
                className="text-slate-300 hover:text-rose-400 p-1 text-xs font-bold hover:bg-rose-50 rounded-lg transition-colors shrink-0">✕</button>
            </div>
          ))
        )}
      </div>
    </div>

    {/* Submit */}
    <button
      type="submit"
      disabled={loading}
      className="w-full bg-linear-to-r from-pink-500 via-rose-500 to-pink-600 text-white py-3.5 rounded-xl font-black hover:opacity-90 disabled:from-slate-200 disabled:to-slate-300 disabled:text-slate-400 shadow-lg shadow-pink-500/25 active:scale-[0.99] transition-all text-sm flex items-center justify-center gap-2"
    >
      {loading ? (
        <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /><span>กำลังประมวลผล...</span></>
      ) : (
        <><span>📝</span><span>ส่งใบเบิก ({cart.length} รายการ)</span></>
      )}
    </button>
  </form>
);

// ── Pagination ────────────────────────────────────────────────────────────────
const ITEMS_PER_PAGE = 15;

function buildPageNumbers(current: number, total: number): (number | '…')[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const pages: (number | '…')[] = [1];
  if (current > 3) pages.push('…');
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) pages.push(i);
  if (current < total - 2) pages.push('…');
  pages.push(total);
  return pages;
}

// ─────────────────────────────────────────────────────────────────────────────

export default function RequisitionPage() {
  const [items, setItems]               = useState<Item[]>([]);
  const [branches, setBranches]         = useState<{ name: string }[]>([]);
  const [searchTerm, setSearchTerm]     = useState('');
  const [requesterName, setRequesterName] = useState('');
  const [branchName, setBranchName]     = useState('');
  const [cart, setCart]                 = useState<CartItem[]>([]);
  const [loading, setLoading]           = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [isCartOpen, setIsCartOpen]     = useState(false);
  const [cartBounce, setCartBounce]     = useState(false);
  const [clickedItemId, setClickedItemId] = useState<string | null>(null);
  const [currentPage, setCurrentPage]   = useState(1);
  const [submittedRequisitionId, setSubmittedRequisitionId] = useState<string | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(true);
  const [catalogError, setCatalogError] = useState('');
  const cartHydratedRef = useRef(false);

  useEffect(() => {
    async function fetchData() {
      setCatalogLoading(true);
      setCatalogError('');
      const [{ data: itemsData, error: itemsError }, { data: branchesData, error: branchesError }] = await Promise.all([
        supabase.from('items').select('id, name, unit, image_url').eq('is_active', true).order('name'),
        supabase.from('branches').select('name').order('name'),
      ]);
      if (itemsData)   setItems(itemsData);
      if (branchesData) setBranches(branchesData);
      if (itemsError || branchesError) setCatalogError('โหลดสินค้าและสาขาไม่สำเร็จ กรุณารีเฟรชหน้าแล้วลองใหม่');
      setCatalogLoading(false);
    }
    fetchData();
  }, []);

  useEffect(() => {
    try {
      const savedCart = window.localStorage.getItem('aemori-requisition-cart');
      if (savedCart) setCart(JSON.parse(savedCart) as CartItem[]);
    } catch {
      window.localStorage.removeItem('aemori-requisition-cart');
    }
    cartHydratedRef.current = true;
  }, []);

  useEffect(() => {
    if (!cartHydratedRef.current) return;
    window.localStorage.setItem('aemori-requisition-cart', JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    const warnBeforeLeave = (event: BeforeUnloadEvent) => {
      if (cart.length === 0) return;
      event.preventDefault();
    };
    window.addEventListener('beforeunload', warnBeforeLeave);
    return () => window.removeEventListener('beforeunload', warnBeforeLeave);
  }, [cart.length]);

  const filteredItems = items.filter((item) =>
    item.name.toLowerCase().includes(searchTerm.toLowerCase())
  );
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / ITEMS_PER_PAGE));
  const pagedItems = filteredItems.slice(
    (currentPage - 1) * ITEMS_PER_PAGE,
    currentPage * ITEMS_PER_PAGE,
  );

  const addToCart = (item: Item) => {
    setClickedItemId(item.id);
    setCartBounce(true);
    setTimeout(() => setClickedItemId(null), 800);
    setTimeout(() => setCartBounce(false), 300);
    setCart((prev) => {
      const idx = prev.findIndex((c) => c.id === item.id);
      if (idx > -1) {
        const next = [...prev];
        next[idx] = { ...next[idx], quantity: next[idx].quantity + 1 };
        return next;
      }
      return [...prev, { ...item, quantity: 1 }];
    });
  };

  const updateQuantity = (id: string, amount: number) =>
    setCart((prev) => prev.map((item) =>
      item.id === id ? { ...item, quantity: Math.max(1, item.quantity + amount) } : item
    ));

  const removeFromCart = (id: string) =>
    setCart((prev) => prev.filter((item) => item.id !== id));

  const totalCartItems = cart.reduce((sum, item) => sum + item.quantity, 0);

  const handlePreSubmitCheck = (e: React.FormEvent) => {
    e.preventDefault();
    if (!branchName.trim())   { alert('กรุณาเลือกสาขา'); return; }
    if (!requesterName.trim()) { alert('กรุณากรอกชื่อผู้เบิก'); return; }
    if (cart.length === 0)    { alert('กรุณาเลือกสินค้าอย่างน้อย 1 รายการ'); return; }
    setIsCartOpen(false);
    setShowConfirmModal(true);
  };

  const handleConfirmSubmit = async () => {
    setShowConfirmModal(false);
    setLoading(true);

    const { data: reqData, error: reqError } = await supabase
      .from('requisitions')
      .insert([{ branch_name: branchName.trim(), requester_name: requesterName.trim(), status: 'pending', total_price: 0 }])
      .select('id')
      .single();

    if (reqError || !reqData) {
      alert(`เกิดข้อผิดพลาด: ${reqError?.message || 'ไม่สามารถสร้างใบเบิกได้'}`);
      setLoading(false);
      return;
    }

    const { data: dbItems } = await supabase.from('items').select('id, price');
    const detailRows = cart.map((item) => ({
      requisition_id: reqData.id,
      item_id: item.id,
      quantity: item.quantity,
      price_at_time: dbItems?.find((d) => d.id === item.id)?.price || 0,
    }));

    const { error: detailError } = await supabase.from('requisition_details').insert(detailRows);
    setLoading(false);

    if (detailError) {
      alert('เกิดข้อผิดพลาดในการบันทึกรายการ: ' + detailError.message);
    } else {
      setSubmittedRequisitionId(reqData.id);
      setCart([]);
      setSearchTerm('');
      setRequesterName('');
      setBranchName('');
      setCurrentPage(1);
    }
  };

  return (
    <div className="min-h-screen bg-[#fdf4f7] py-6 sm:py-8 px-3 sm:px-6 lg:px-8 text-slate-800 relative pb-24 lg:pb-10">
      <div className="max-w-7xl mx-auto space-y-5">

        {catalogError && <div className="rounded-2xl border border-rose-200 bg-rose-50 px-4 py-3 text-center text-sm font-bold text-rose-600">⚠️ {catalogError}</div>}
        {catalogLoading && <div className="rounded-2xl border border-pink-100 bg-white px-4 py-3 text-center text-sm font-bold text-pink-500"><span className="mr-2 inline-block h-3 w-3 animate-spin rounded-full border-2 border-pink-200 border-t-pink-500" />กำลังโหลดสินค้า...</div>}

        {/* ── Header ── */}
        <div className="relative bg-white border border-pink-100/80 rounded-2xl overflow-hidden shadow-sm">
          {/* decorative gradient strip */}
          <div className="absolute top-0 inset-x-0 h-1 bg-linear-to-r from-pink-400 via-rose-400 to-pink-500" />
          {/* subtle mesh */}
          <div className="absolute inset-0 opacity-[0.03] pointer-events-none"
            style={{ backgroundImage: 'radial-gradient(circle at 80% 50%, #f43f5e 0%, transparent 60%)' }} />

          <div className="relative p-5 sm:p-6 flex flex-col sm:flex-row items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <div className="w-11 h-11 rounded-xl bg-pink-50 flex items-center justify-center overflow-hidden border border-pink-100 shadow-inner">
                <img src="/logo.png" alt="Logo" className="w-full h-full object-cover" />
              </div>
              <div>
                <h1 className="text-lg sm:text-xl font-black tracking-tight text-slate-800 leading-tight">
                  ใบเบิกของ Aemori
                </h1>
                <p className="text-[10px] font-bold text-pink-400 mt-0.5 uppercase tracking-[0.15em]">
                  ระบบจัดการคำขอเบิกวัสดุอุปกรณ์
                </p>
              </div>
            </div>

            <div className="flex items-center gap-3">
              {totalCartItems > 0 && (
                <div className="flex items-center gap-2 bg-pink-50 border border-pink-100 rounded-xl px-3.5 py-2">
                  <span className="text-xs font-black text-pink-500">🛒</span>
                  <span className="text-sm font-black text-pink-600">{totalCartItems} ชิ้น</span>
                  <span className="text-xs text-pink-300">|</span>
                  <span className="text-xs font-semibold text-pink-400">{cart.length} รายการ</span>
                </div>
              )}
              <div className="bg-slate-50 border border-slate-200/80 rounded-xl px-3.5 py-2 text-center">
                <span className="block text-[9px] font-black text-slate-400 uppercase tracking-widest">ประเภท</span>
                <span className="text-xs font-black text-slate-600">Requisition Form</span>
              </div>
            </div>
          </div>
        </div>

        <div className="flex flex-col lg:flex-row gap-5 items-start">

          {/* ── Left: items ── */}
          <div className="flex-1 w-full min-w-0">

            {/* Search bar */}
            <div className="relative mb-4 group">
              <span className="absolute inset-y-0 left-0 flex items-center pl-4 pointer-events-none text-slate-300 group-focus-within:text-pink-400 transition-colors text-sm">🔍</span>
              <input
                type="text"
                placeholder="ค้นหาสินค้า เช่น กระดาษ A4, ปากกา..."
                value={searchTerm}
                onChange={(e) => { setSearchTerm(e.target.value); setCurrentPage(1); }}
                className="w-full pl-10 pr-4 py-3 bg-white border border-slate-200 hover:border-pink-200 focus:border-pink-400 rounded-xl outline-none focus:ring-2 focus:ring-pink-400/15 transition-all text-sm font-semibold text-slate-700 placeholder:text-slate-300 shadow-sm"
              />
              {searchTerm && (
                <button
                  onClick={() => { setSearchTerm(''); setCurrentPage(1); }}
                  className="absolute inset-y-0 right-0 flex items-center pr-4 text-slate-300 hover:text-slate-500 transition-colors text-lg font-light"
                >×</button>
              )}
            </div>

            {/* Count label */}
            {filteredItems.length > 0 && (
              <p className="text-xs font-semibold text-slate-400 mb-3 px-0.5">
                {searchTerm
                  ? `พบ ${filteredItems.length} รายการสำหรับ "${searchTerm}"`
                  : `สินค้าทั้งหมด ${filteredItems.length} รายการ`}
              </p>
            )}

            {/* Items grid — catalog style: image on top */}
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredItems.length === 0 ? (
                <div className="col-span-full text-center py-16 bg-white rounded-2xl border border-slate-100 shadow-sm">
                  <span className="text-4xl block mb-2 opacity-30">📂</span>
                  <p className="text-slate-400 text-sm font-bold">
                    {searchTerm ? `ไม่พบสินค้า "${searchTerm}"` : 'ยังไม่มีสินค้าในระบบ'}
                  </p>
                </div>
              ) : (
                pagedItems.map((item) => {
                  const isClicked = clickedItemId === item.id;
                  const inCart    = cart.find((c) => c.id === item.id);
                  return (
                    <div
                      key={item.id}
                      className={`bg-white border rounded-2xl overflow-hidden flex flex-col transition-all duration-200 group ${
                        isClicked
                          ? 'border-rose-300 ring-2 ring-rose-400/10 shadow-md shadow-rose-100'
                          : inCart
                          ? 'border-pink-200 shadow-sm shadow-pink-100/50'
                          : 'border-slate-100 hover:border-pink-200 hover:shadow-md hover:shadow-pink-50 hover:-translate-y-0.5'
                      }`}
                    >
                      {/* Image area */}
                      <div className="relative aspect-square bg-slate-50 overflow-hidden">
                        {item.image_url ? (
                          <img
                            src={item.image_url}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                          />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center">
                            <span className="text-4xl opacity-20">📦</span>
                          </div>
                        )}
                        {/* In-cart badge */}
                        {inCart && (
                          <div className="absolute top-2 right-2 w-6 h-6 rounded-full bg-pink-500 text-white text-[10px] font-black flex items-center justify-center border-2 border-white shadow-md">
                            {inCart.quantity}
                          </div>
                        )}
                        {/* Unit tag */}
                        <div className="absolute bottom-2 left-2">
                          <span className="text-[10px] font-black text-pink-500 bg-white/90 backdrop-blur-sm px-2 py-0.5 rounded-full border border-pink-100 shadow-sm">
                            {item.unit || 'ชิ้น'}
                          </span>
                        </div>
                      </div>

                      {/* Info + button */}
                      <div className="p-2.5 flex flex-col gap-2 flex-1">
                        <h4 className="font-bold text-slate-800 text-xs leading-snug line-clamp-2 group-hover:text-pink-600 transition-colors flex-1">
                          {item.name}
                        </h4>
                        <button
                          type="button"
                          onClick={() => addToCart(item)}
                          className={`w-full py-2 rounded-xl font-black text-xs active:scale-95 transition-all border ${
                            isClicked
                              ? 'bg-rose-500 border-rose-500 text-white shadow-md shadow-rose-200'
                              : inCart
                              ? 'bg-pink-500 border-pink-500 text-white'
                              : 'bg-pink-50 border-pink-100 text-pink-600 hover:bg-pink-500 hover:text-white hover:border-pink-500 hover:shadow-md hover:shadow-pink-200/50'
                          }`}
                        >
                          {isClicked ? '✓ เพิ่มแล้ว' : inCart ? `+ เพิ่ม (${inCart.quantity})` : '+ เพิ่มในตะกร้า'}
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>

            {/* ── Pagination bar ── */}
            {totalPages > 1 && (
              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 mt-5 pt-4 border-t border-pink-100">
                <p className="text-xs font-semibold text-slate-400">
                  แสดง {(currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filteredItems.length)} จาก {filteredItems.length} รายการ
                </p>
                <div className="flex items-center gap-1.5 flex-wrap justify-center">
                  <button
                    onClick={() => setCurrentPage((p) => p - 1)}
                    disabled={currentPage === 1}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-pink-100 bg-white text-pink-400 hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                  >
                    ← ก่อนหน้า
                  </button>
                  {buildPageNumbers(currentPage, totalPages).map((p, idx) =>
                    p === '…' ? (
                      <span key={`e${idx}`} className="px-1 text-slate-300 text-sm select-none">…</span>
                    ) : (
                      <button
                        key={p}
                        onClick={() => setCurrentPage(p as number)}
                        className={`w-8 h-8 rounded-xl text-xs font-bold transition-all active:scale-95 ${
                          currentPage === p
                            ? 'bg-linear-to-br from-pink-500 to-rose-500 text-white shadow-md shadow-pink-300/40'
                            : 'border border-pink-100 bg-white text-pink-400 hover:bg-pink-50 shadow-sm'
                        }`}
                      >
                        {p}
                      </button>
                    )
                  )}
                  <button
                    onClick={() => setCurrentPage((p) => p + 1)}
                    disabled={currentPage === totalPages}
                    className="px-3 py-1.5 rounded-xl text-xs font-bold border border-pink-100 bg-white text-pink-400 hover:bg-pink-50 disabled:opacity-40 disabled:cursor-not-allowed transition-all active:scale-95 shadow-sm"
                  >
                    ถัดไป →
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* ── Right: Desktop cart ── */}
          <div className="hidden lg:block lg:w-80 shrink-0">
            <div className="bg-white rounded-2xl shadow-sm border border-slate-100 overflow-hidden lg:sticky lg:top-6">
              {/* Cart header strip */}
              <div className="bg-linear-to-r from-pink-500 to-rose-500 px-5 py-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="text-white text-base">📋</span>
                  <span className="font-black text-white text-sm">สรุปใบเบิกสินค้า</span>
                </div>
                {cart.length > 0 && (
                  <span className="bg-white/20 text-white text-xs font-black px-2.5 py-1 rounded-full border border-white/20">
                    {cart.length} รายการ
                  </span>
                )}
              </div>
              <div className="p-4">
                <CartFormContent
                  branchName={branchName} setBranchName={setBranchName}
                  branches={branches}
                  requesterName={requesterName} setRequesterName={setRequesterName}
                  handlePreSubmitCheck={handlePreSubmitCheck}
                  totalCartItems={totalCartItems}
                  cart={cart} updateQuantity={updateQuantity} removeFromCart={removeFromCart}
                  loading={loading} cartBounce={cartBounce}
                />
              </div>
            </div>
          </div>
        </div>
      </div>

      {submittedRequisitionId && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-slate-900/30 p-4 backdrop-blur-sm">
          <div className="w-full max-w-sm rounded-3xl border border-emerald-100 bg-white p-7 text-center shadow-2xl">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-emerald-100 text-3xl">✓</div>
            <h2 className="mt-4 text-xl font-black text-slate-800">ส่งใบเบิกเรียบร้อยแล้ว</h2>
            <p className="mt-2 text-sm font-semibold text-slate-500">ระบบบันทึกคำขอและส่งให้ผู้ดูแลตรวจสอบแล้ว</p>
            <div className="mt-4 rounded-xl bg-slate-50 px-4 py-3 text-xs font-bold text-slate-500">เลขอ้างอิง: {submittedRequisitionId.slice(0, 8).toUpperCase()}</div>
            <button type="button" onClick={() => setSubmittedRequisitionId(null)} className="mt-5 h-11 w-full rounded-xl bg-linear-to-r from-pink-500 to-rose-400 text-sm font-black text-white">สร้างใบเบิกใหม่</button>
          </div>
        </div>
      )}

      {/* ── Mobile floating bar ── */}
      <div className="lg:hidden fixed bottom-0 inset-x-0 bg-white/95 backdrop-blur-md border-t border-pink-100 px-4 py-3 z-40 flex items-center justify-between shadow-[0_-8px_24px_rgba(244,63,94,0.08)]">
        <div className="flex items-center gap-3">
          <div className={`relative transition-transform duration-300 ${cartBounce ? 'scale-125' : 'scale-100'}`}>
            <span className="text-2xl">🛒</span>
            {totalCartItems > 0 && (
              <span className={`absolute -top-1.5 -right-2 text-white w-5 h-5 rounded-full text-[10px] font-black flex items-center justify-center border-2 border-white shadow-sm transition-all ${
                cartBounce ? 'bg-rose-500 scale-110' : 'bg-pink-500'
              }`}>
                {totalCartItems}
              </span>
            )}
          </div>
          <div>
            <p className="text-sm font-black text-slate-700 leading-tight">
              {totalCartItems > 0 ? `${totalCartItems} ชิ้น` : 'ตะกร้าว่างอยู่'}
            </p>
            {cart.length > 0 && (
              <p className="text-[10px] text-pink-400 font-semibold">{cart.length} รายการ</p>
            )}
          </div>
        </div>
        <button
          type="button"
          onClick={() => setIsCartOpen(true)}
          className="bg-linear-to-r from-pink-500 to-rose-500 text-white px-5 py-2.5 rounded-xl text-sm font-black shadow-lg shadow-pink-500/25 active:scale-95 transition-all"
        >
          ดูใบเบิก →
        </button>
      </div>

      {/* ── Mobile drawer backdrop ── */}
      <div
        className={`lg:hidden fixed inset-0 bg-slate-900/30 backdrop-blur-sm z-50 transition-opacity duration-300 ${
          isCartOpen ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'
        }`}
        onClick={() => setIsCartOpen(false)}
      />

      {/* ── Mobile drawer ── */}
      <div className={`lg:hidden fixed inset-y-0 right-0 w-full sm:w-96 bg-white z-50 shadow-2xl flex flex-col transition-transform duration-300 ease-out ${
        isCartOpen ? 'translate-x-0' : 'translate-x-full'
      }`}>
        <div className="bg-linear-to-r from-pink-500 to-rose-500 p-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-white">📋</span>
            <h3 className="font-black text-white text-sm">สรุปใบเบิกสินค้า</h3>
          </div>
          <button
            type="button"
            onClick={() => setIsCartOpen(false)}
            className="text-white/70 hover:text-white text-2xl font-light w-8 h-8 flex items-center justify-center rounded-xl hover:bg-white/10 transition-colors"
          >×</button>
        </div>
        <div className="flex-1 overflow-hidden p-4">
          <CartFormContent
            branchName={branchName} setBranchName={setBranchName}
            branches={branches}
            requesterName={requesterName} setRequesterName={setRequesterName}
            handlePreSubmitCheck={handlePreSubmitCheck}
            totalCartItems={totalCartItems}
            cart={cart} updateQuantity={updateQuantity} removeFromCart={removeFromCart}
            loading={loading} cartBounce={cartBounce}
          />
        </div>
      </div>

      {/* ── Confirm Modal ── */}
      {showConfirmModal && (
        <div className="fixed inset-0 bg-slate-900/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full shadow-2xl border border-slate-100 overflow-hidden">
            <div className="bg-linear-to-r from-pink-600 to-rose-600 text-white p-5 flex items-center gap-3">
              <span className="text-xl">📋</span>
              <div>
                <h3 className="font-black text-base">ตรวจสอบรายละเอียดใบเบิก</h3>
                <p className="text-xs text-pink-100 mt-0.5 font-medium">กรุณาตรวจสอบความถูกต้องก่อนส่ง</p>
              </div>
            </div>

            <div className="p-5 space-y-4 max-h-[60vh] overflow-y-auto">
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-pink-50 p-3.5 rounded-xl border border-pink-100">
                  <span className="block text-[10px] font-black text-pink-400 uppercase tracking-wider">สาขา</span>
                  <span className="font-black text-slate-800 text-sm mt-1 block">{branchName}</span>
                </div>
                <div className="bg-pink-50 p-3.5 rounded-xl border border-pink-100">
                  <span className="block text-[10px] font-black text-pink-400 uppercase tracking-wider">ผู้เบิก</span>
                  <span className="font-black text-slate-800 text-sm mt-1 block">{requesterName}</span>
                </div>
              </div>

              <div>
                <span className="block text-[10px] font-black text-slate-400 uppercase tracking-wider mb-2">
                  รายการสินค้า ({totalCartItems} ชิ้น / {cart.length} รายการ)
                </span>
                <div className="rounded-xl overflow-hidden divide-y divide-slate-100 border border-slate-100 max-h-60 overflow-y-auto shadow-sm">
                  {cart.map((item) => (
                    <div key={item.id} className="p-3 flex items-center justify-between bg-white hover:bg-slate-50 transition-colors">
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-slate-50 rounded-lg overflow-hidden border border-slate-100 shrink-0 flex items-center justify-center">
                          {item.image_url
                            ? <img src={item.image_url} alt={item.name} className="w-full h-full object-cover" />
                            : <span className="text-xs">📦</span>}
                        </div>
                        <span className="font-bold text-slate-700 truncate text-xs">{item.name}</span>
                      </div>
                      <span className="font-black text-pink-600 bg-pink-50 border border-pink-100 px-2.5 py-1 rounded-lg text-xs ml-3 shrink-0">
                        {item.quantity} {item.unit}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => { setShowConfirmModal(false); setIsCartOpen(true); }}
                className="w-full bg-white text-slate-600 border border-slate-200 py-3 rounded-xl font-bold hover:bg-slate-100 active:scale-[0.98] transition-all text-sm"
              >
                ← แก้ไข
              </button>
              <button
                type="button"
                onClick={handleConfirmSubmit}
                className="w-full bg-linear-to-r from-pink-600 to-rose-600 text-white py-3 rounded-xl font-black hover:opacity-90 shadow-lg shadow-pink-200 active:scale-[0.98] transition-all text-sm"
              >
                ยืนยันส่งใบเบิก ✓
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
