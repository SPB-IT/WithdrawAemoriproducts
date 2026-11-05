'use client';

import Link from 'next/link';
import { useParams } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { IssueBadge, IssueBanner, StatusTimeline } from '@/components/stock-request/BillParts';
import { EmptyState, ErrorState, LoadingState, PhotoThumb, StatusBadge } from '@/components/stock-request/ui';
import { apiFetch, errorMessage, formatDateTime, formatNumber } from '@/lib/stock-request/client';
import type { BillDetail, Branch } from '@/lib/stock-request/types';

// ประวัติของสาขาเดียว: 3 บิลล่าสุด + บิลที่ปัญหายังไม่ปิด (ไม่ถูกลบจนกว่าจะปิดเรื่อง)
export default function BranchHistoryPage() {
  const { branchId } = useParams<{ branchId: string }>();
  const [branch, setBranch] = useState<Branch | null>(null);
  const [bills, setBills] = useState<BillDetail[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const data = await apiFetch<{ branch: Branch; bills: BillDetail[] }>(`/admin/stock-request/api/branches-overview?branch=${encodeURIComponent(branchId)}`);
      setBranch(data.branch);
      setBills(data.bills);
      setError(null);
    } catch (err) {
      setError(errorMessage(err));
    }
  }, [branchId]);

  useEffect(() => {
    const timer = setTimeout(load, 0);
    return () => clearTimeout(timer);
  }, [load]);

  if (error && !bills) return <ErrorState message={error} onRetry={load} />;
  if (!bills || !branch) return <LoadingState />;

  return (
    <div className="space-y-4">
      <Link href="/admin/stock-request/branches" className="text-xs font-bold text-slate-500 hover:text-pink-600">
        ← ประวัติบิล
      </Link>
      <div>
        <h1 className="text-2xl font-black">🏪 {branch.name}</h1>
        <p className="text-sm text-slate-500">3 บิลล่าสุดที่ตัดแล้ว และบิลที่มีปัญหาค้าง</p>
      </div>

      {bills.length === 0 ? (
        <EmptyState icon="🗂️" title="ยังไม่มีบิลที่ตัดแล้ว" description="เมื่อสาขานี้มีบิลที่ตัดแล้ว จะแสดงที่นี่" />
      ) : (
        bills.map((bill) => {
          const items = bill.items.filter((item) => !item.is_removed);
          return (
            <section key={bill.id} className={`rounded-2xl border bg-white p-4 shadow-sm ${bill.issue_status === 'open' ? 'border-rose-200' : 'border-pink-100'}`}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <Link href={`/admin/stock-request/bills/${bill.id}`} className="font-mono text-lg font-black text-slate-800 hover:text-pink-600">
                    {bill.bill_no} →
                  </Link>
                  <p className="text-xs text-slate-500">
                    สร้าง {formatDateTime(bill.created_at)} · {items.length} รายการ
                    {bill.responsible_name ? ` · ผู้รับผิดชอบ ${bill.responsible_name}` : ''}
                  </p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  <StatusBadge status={bill.status} />
                  <IssueBadge bill={bill} />
                </div>
              </div>
              <div className="mt-4">
                <StatusTimeline bill={bill} />
              </div>
              {bill.issue_status && (
                <div className="mt-3">
                  <IssueBanner bill={bill} />
                </div>
              )}
              <details className="mt-3">
                <summary className="cursor-pointer text-sm font-bold text-pink-600">ดูรายการสินค้า ({items.length})</summary>
                <ul className="mt-2 space-y-2">
                  {items.map((item) => (
                    <li key={item.id} className="flex gap-3 rounded-xl bg-slate-50 p-2.5">
                      <PhotoThumb url={item.substitution?.photo_url ?? item.photo_url} alt={item.product_name} className="h-14 w-14" />
                      <div className="min-w-0 text-xs">
                        <p className="font-bold text-slate-800">{item.substitution ? `${item.substitution.product_name} (แทน ${item.product_name})` : item.product_name}</p>
                        <p className="text-slate-500">
                          รหัส {item.substitution?.product_code ?? item.product_code} · สั่ง {formatNumber(item.stock_on_hand)} ชิ้น
                        </p>
                        {item.received_state === 'ok' && <p className="font-bold text-emerald-700">✓ สาขาได้รับแล้ว</p>}
                        {item.received_state === 'missing' && <p className="font-bold text-rose-600">✗ ไม่ได้รับ/ไม่ครบ: {item.received_note}</p>}
                      </div>
                    </li>
                  ))}
                </ul>
              </details>
            </section>
          );
        })
      )}
    </div>
  );
}
