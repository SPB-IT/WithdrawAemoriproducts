-- =====================================================================
-- Stock Request: บิลที่มีปัญหา (สาขาแจ้งได้ของไม่ครบตอนยืนยันรับ)
-- issue_status: null = ไม่มีปัญหา · 'open' = รอแก้ไข · 'resolved' = ผู้ดูแลปิดเรื่องแล้ว
-- บิลที่ issue_status = 'open' จะไม่ถูกลบตามกฎเก็บประวัติ 3 บิล จนกว่าจะปิดเรื่อง
-- =====================================================================

alter table stock_request.bills
  add column if not exists issue_status text check (issue_status is null or issue_status in ('open', 'resolved')),
  add column if not exists issue_summary text,
  add column if not exists issue_opened_at timestamptz,
  add column if not exists issue_resolved_note text,
  add column if not exists issue_resolved_by text,
  add column if not exists issue_resolved_at timestamptz;

create index if not exists bills_issue_open_idx on stock_request.bills (issue_opened_at desc) where issue_status = 'open';

create or replace function stock_request.enforce_history_limit(p_branch_id bigint)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ids uuid[];
begin
  select coalesce(array_agg(r.id), '{}') into v_ids
  from (
    select b.id, b.status, b.issue_status,
           row_number() over (order by b.created_at desc, b.bill_no desc) as rn
    from stock_request.bills b
    where b.branch_id = p_branch_id and b.status <> 'pending'
  ) r
  where r.rn > 3 and r.status = 'received' and coalesce(r.issue_status, '') <> 'open'; -- บิลที่ปัญหายังไม่ปิด ห้ามลบ

  if cardinality(v_ids) = 0 then
    return 0;
  end if;

  insert into stock_request.storage_cleanup_queue (bucket, path, reason)
  select distinct 'stock-request-photos', p.path, 'history_limit'
  from (
    select i.photo_path as path
    from stock_request.bill_items i
    where i.bill_id = any (v_ids) and i.photo_path is not null
    union
    select s.photo_path
    from stock_request.item_substitutions s
    join stock_request.bill_items i on i.id = s.bill_item_id
    where i.bill_id = any (v_ids) and s.photo_path is not null
  ) p;

  perform set_config('stock_request.allow_purge', 'on', true);
  delete from stock_request.bills where id = any (v_ids);
  perform set_config('stock_request.allow_purge', '', true);

  return cardinality(v_ids);
end;
$$;

revoke execute on function stock_request.enforce_history_limit(bigint) from public, anon, authenticated;
grant execute on function stock_request.enforce_history_limit(bigint) to service_role;

notify pgrst, 'reload schema';
