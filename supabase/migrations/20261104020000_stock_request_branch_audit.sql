-- =====================================================================
-- Stock Request: บันทึกการกระทำของสาขาลง audit_logs ด้วย (ให้ผู้ดูแลเห็นว่าใครทำอะไร)
-- - log ของสาขา: admin_id = null, admin_name = 'สาขา · <ชื่อพนักงาน>'
-- - เขียนจาก API ฝั่ง server (service role) หลัง function หลักทำงานสำเร็จ
-- - กติกา "สาขาลบรายการได้ถ้า HQ ยังไม่แตะ" ดูเฉพาะ log ของผู้ดูแล (admin_id ไม่ว่าง)
-- =====================================================================

alter table stock_request.audit_logs alter column admin_id drop not null;

create or replace function stock_request.branch_delete_item(p_branch_id bigint, p_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item stock_request.bill_items;
begin
  v_item := stock_request.branch_lock_item(p_branch_id, p_item_id);

  if exists (select 1 from stock_request.item_substitutions where bill_item_id = p_item_id)
     or exists (select 1 from stock_request.audit_logs where bill_item_id = p_item_id and admin_id is not null) then
    perform stock_request.fail('SR_ITEM_LOCKED', 'สำนักงานใหญ่แก้ไขรายการนี้แล้ว ลบเองไม่ได้ กรุณาแจ้งสำนักงานใหญ่');
  end if;

  delete from stock_request.bill_items where id = p_item_id;
  if v_item.photo_path is not null then
    insert into stock_request.storage_cleanup_queue (bucket, path, reason)
    values ('stock-request-photos', v_item.photo_path, 'branch_item_deleted');
  end if;

  update stock_request.bills set version = version + 1 where id = v_item.bill_id;
  return jsonb_build_object('deleted', p_item_id, 'bill_id', v_item.bill_id);
end;
$$;

revoke execute on function stock_request.branch_delete_item(bigint, uuid) from public, anon, authenticated;
grant execute on function stock_request.branch_delete_item(bigint, uuid) to service_role;

notify pgrst, 'reload schema';
