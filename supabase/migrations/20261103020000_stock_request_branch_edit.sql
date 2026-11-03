-- =====================================================================
-- Stock Request: สาขาแก้ไข/ลบรายการที่ลงผิดได้ ระหว่างที่บิลยังไม่ถูกตัด (pending)
-- - ล็อกบิล (for update) กันแก้ชนกับการตัดบิล
-- - แก้ได้เฉพาะรายการที่สาขาลงเอง (source = 'branch')
-- - ลบได้เฉพาะรายการที่ HQ ยังไม่แตะ (ไม่มีประวัติแก้ไข/สินค้าทดแทน) — ไม่ให้งานของ HQ หาย
-- - เปลี่ยนรูป/ลบรายการ → รูปเก่าเข้า storage_cleanup_queue
-- - ทุกครั้งเพิ่ม bills.version ให้ HQ ที่เปิดตรวจอยู่ต้องโหลดใหม่ก่อนตัดบิล
-- =====================================================================

create or replace function stock_request.branch_lock_item(p_branch_id bigint, p_item_id uuid)
returns stock_request.bill_items
language plpgsql
set search_path = ''
as $$
declare
  v_item stock_request.bill_items;
  v_bill stock_request.bills;
begin
  perform stock_request.require_branch(p_branch_id);
  select * into v_item from stock_request.bill_items where id = p_item_id;
  if not found or v_item.branch_id <> p_branch_id or v_item.source <> 'branch' or v_item.is_removed then
    perform stock_request.fail('SR_ITEM_NOT_FOUND', 'ไม่พบรายการนี้');
  end if;
  v_bill := stock_request.lock_bill(v_item.bill_id);
  if v_bill.status <> 'pending' then
    perform stock_request.fail('SR_ALREADY_BILLED', 'บิลนี้ถูกตัดแล้ว แก้ไขเองไม่ได้ กรุณาแจ้งสำนักงานใหญ่');
  end if;
  -- อ่านใหม่หลังล็อกบิล
  select * into v_item from stock_request.bill_items where id = p_item_id;
  return v_item;
end;
$$;

create or replace function stock_request.branch_update_item(
  p_branch_id      bigint,
  p_item_id        uuid,
  p_product_name   text,
  p_product_code   text,
  p_stock_on_hand  integer,
  p_staff_note     text,
  p_photo_path     text
)
returns stock_request.bill_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item  stock_request.bill_items;
  v_name  text := stock_request.clean_text(p_product_name, 200);
  v_code  text := stock_request.clean_text(p_product_code, 100);
  v_note  text := stock_request.clean_text(p_staff_note, 1000);
  v_photo text;
begin
  v_item := stock_request.branch_lock_item(p_branch_id, p_item_id);

  if v_name is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกชื่อสินค้า');
  end if;
  if v_code is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกรหัสสินค้า');
  end if;
  if p_stock_on_hand is null or p_stock_on_hand < 0 then
    perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนคงเหลือต้องเป็น 0 หรือมากกว่า');
  end if;

  v_photo := coalesce(p_photo_path, v_item.photo_path);
  if v_photo is distinct from v_item.photo_path then
    if not stock_request.valid_photo_path(p_branch_id, v_photo) then
      perform stock_request.fail('SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง กรุณาถ่ายหรืออัปโหลดใหม่');
    end if;
    if v_item.photo_path is not null then
      insert into stock_request.storage_cleanup_queue (bucket, path, reason)
      values ('stock-request-photos', v_item.photo_path, 'branch_photo_replaced');
    end if;
  end if;

  update stock_request.bill_items
     set product_name = v_name,
         product_code = v_code,
         stock_on_hand = p_stock_on_hand,
         staff_note = v_note,
         photo_path = v_photo
   where id = p_item_id
  returning * into v_item;

  update stock_request.bills set version = version + 1 where id = v_item.bill_id;
  return v_item;
end;
$$;

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
     or exists (select 1 from stock_request.audit_logs where bill_item_id = p_item_id) then
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

revoke execute on function stock_request.branch_lock_item(bigint, uuid) from public, anon, authenticated;
revoke execute on function stock_request.branch_update_item(bigint, uuid, text, text, integer, text, text) from public, anon, authenticated;
revoke execute on function stock_request.branch_delete_item(bigint, uuid) from public, anon, authenticated;
grant execute on function stock_request.branch_lock_item(bigint, uuid) to service_role;
grant execute on function stock_request.branch_update_item(bigint, uuid, text, text, integer, text, text) to service_role;
grant execute on function stock_request.branch_delete_item(bigint, uuid) to service_role;
