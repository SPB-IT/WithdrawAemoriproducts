-- ลบสาขา: เดิมลบไม่ได้เพราะ stock_request.bills / bill_counters อ้างอิงสาขา (FK restrict)
-- และระบบเปิดบิลให้สาขาอัตโนมัติเมื่อมีคนเข้าหน้าแจ้งของ จึงแทบทุกสาขามีบิลอย่างน้อย 1 ใบ
-- ใหม่:
--   - ไม่มีประวัติจริง (มีแค่บิลรออนุมัติที่ว่าง) → ลบบิลว่างแล้วลบสาขาจริง
--   - มีประวัติ (บิลที่มีรายการ หรือบิลที่ตัดแล้ว) → เก็บถาวร (archived_at) ซ่อนจากทุกรายการ แต่ประวัติยังอยู่

alter table public.branches add column if not exists archived_at timestamptz;

create or replace function stock_request.admin_remove_branch(p_branch_id bigint)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_has_history boolean;
begin
  perform 1 from public.branches where id = p_branch_id for update;
  if not found then
    perform stock_request.fail('SR_BRANCH_NOT_FOUND', 'ไม่พบสาขานี้');
  end if;

  select exists (
    select 1 from stock_request.bills b
    where b.branch_id = p_branch_id
      and (b.status <> 'pending' or exists (select 1 from stock_request.bill_items i where i.bill_id = b.id))
  ) into v_has_history;

  if v_has_history then
    update public.branches set archived_at = coalesce(archived_at, now()) where id = p_branch_id;
    return 'archived';
  end if;

  perform set_config('stock_request.allow_purge', 'on', true);
  delete from stock_request.bills where branch_id = p_branch_id;
  perform set_config('stock_request.allow_purge', '', true);
  delete from stock_request.bill_counters where branch_id = p_branch_id;
  delete from public.branches where id = p_branch_id;
  return 'deleted';
end;
$$;

revoke execute on function stock_request.admin_remove_branch(bigint) from public, anon, authenticated;
grant execute on function stock_request.admin_remove_branch(bigint) to service_role;

notify pgrst, 'reload schema';
