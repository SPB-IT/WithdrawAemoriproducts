-- =====================================================================
-- ระบบเบิกสินค้า (schema public): ปิดสิทธิ์เขียนของคีย์สาธารณะ (anon / authenticated)
--
-- ⚠️ รันหลังจาก deploy โค้ดที่ย้ายการเขียนข้อมูลไปที่ API ฝั่ง server แล้วเท่านั้น
--    (/api/requisition/submit, /api/admin/*) — ถ้ารันก่อน หน้าเว็บเวอร์ชันเก่าจะบันทึกข้อมูลไม่ได้
--
-- หลังรัน:
-- - เบราว์เซอร์อ่านได้อย่างเดียว (items, branches, requisitions, requisition_details)
-- - การเขียนทั้งหมดทำผ่าน server ด้วย service role (bypass RLS)
-- - ปรับสต็อก (increment/decrement_item_stock) เรียกได้เฉพาะ service role
-- - อัปโหลดรูปสินค้าทำผ่าน server เท่านั้น (รูปยังเปิดดูแบบสาธารณะได้เหมือนเดิม)
-- =====================================================================

begin;

-- 1) ลบ policy ที่อนุญาตให้เขียน (เก็บ policy SELECT ไว้ให้หน้าเว็บอ่านได้)
do $$
declare
  p record;
begin
  for p in
    select policyname, tablename
    from pg_policies
    where schemaname = 'public'
      and tablename in ('items', 'branches', 'requisitions', 'requisition_details')
      and cmd <> 'SELECT'
  loop
    execute format('drop policy %I on public.%I', p.policyname, p.tablename);
  end loop;
end;
$$;

-- policy "ALL" ของ items ถูกลบในข้อ 1 ด้วย → สร้าง policy อ่านอย่างเดียวให้แน่ใจว่าแคตตาล็อกยังเปิดได้
do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'items' and cmd = 'SELECT') then
    create policy items_public_read on public.items for select to anon, authenticated using (true);
  end if;
end;
$$;

-- 2) ถอนสิทธิ์เขียนระดับตาราง (กันไว้อีกชั้น แม้มีคนเพิ่ม policy ภายหลัง)
revoke insert, update, delete, truncate on public.items, public.branches, public.requisitions, public.requisition_details
  from anon, authenticated;

-- 3) ฟังก์ชันปรับสต็อก: เฉพาะ server
revoke execute on function public.increment_item_stock(uuid, integer) from public, anon, authenticated;
revoke execute on function public.decrement_item_stock(uuid, integer) from public, anon, authenticated;
grant execute on function public.increment_item_stock(uuid, integer) to service_role;
grant execute on function public.decrement_item_stock(uuid, integer) to service_role;

-- 4) Storage product-images: ปิดการอัปโหลดจากเบราว์เซอร์ (การอ่านรูปสาธารณะยังเหมือนเดิม)
do $$
declare
  p record;
begin
  for p in
    select policyname
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
      and (coalesce(qual, '') || coalesce(with_check, '')) like '%product-images%'
  loop
    execute format('drop policy %I on storage.objects', p.policyname);
  end loop;
end;
$$;

commit;

-- ตรวจผล: ต้องไม่มี policy เขียน และ anon ต้องไม่มีสิทธิ์เขียน
select tablename, cmd, policyname from pg_policies
where schemaname = 'public' and tablename in ('items', 'branches', 'requisitions', 'requisition_details')
order by tablename, cmd;
