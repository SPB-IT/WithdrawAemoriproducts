-- =====================================================================
-- Smoke test ระบบ Stock Request
-- รันใน Supabase SQL Editor ได้เลย — ทุกอย่างอยู่ใน transaction และ ROLLBACK ตอนท้าย
-- ไม่มีข้อมูลค้างในฐานข้อมูลจริง ถ้าผ่านทั้งหมดจะเห็น NOTICE: ALL STOCK REQUEST TESTS PASSED
-- =====================================================================
begin;

do $$
declare
  v_branch    bigint;
  v_admin     uuid := gen_random_uuid();
  v_admin2    uuid := gen_random_uuid();
  v_bill      stock_request.bills;
  v_item      stock_request.bill_items;
  v_item2     uuid := gen_random_uuid();
  v_res       jsonb;
  v_version   integer;
  v_count     integer;
  v_failed    boolean;
  v_err       text;
  v_month     text := to_char(now(), 'YYYYMM');
  v_first_bill uuid;
  i           integer;
begin
  select id into v_branch from public.branches order by id limit 1;
  if v_branch is null then raise exception 'ไม่มีข้อมูลใน public.branches'; end if;

  insert into auth.users (id, email) values (v_admin, 'sr-test-admin@example.com'), (v_admin2, 'sr-test-off@example.com');
  insert into stock_request.admin_profiles (id, display_name, email) values (v_admin, 'แอดมินทดสอบ', 'sr-test-admin@example.com');
  insert into stock_request.admin_profiles (id, display_name, is_active) values (v_admin2, 'แอดมินปิดใช้งาน', false);

  -- 1) เปิดบิลอัตโนมัติ + เลขบิล AMR
  v_bill := stock_request.get_or_open_bill(v_branch);
  assert v_bill.status = 'pending', 'bill should be pending';
  assert v_bill.bill_no like 'AMR-%', 'bill_no should start with AMR';
  assert (stock_request.get_or_open_bill(v_branch)).id = v_bill.id, 'should reuse same open bill';
  v_first_bill := v_bill.id;

  -- 2) สาขาเพิ่มรายการ + กดซ้ำได้ (idempotent)
  v_item := stock_request.add_branch_item(v_branch, gen_random_uuid(), 'ถุงหิ้ว S', 'SP-3396', 4, null,
              v_branch || '/' || v_month || '/' || gen_random_uuid() || '.jpg', 'พนักงานทดสอบ');
  assert v_item.bill_id = v_bill.id, 'item must go into open bill';
  assert (stock_request.add_branch_item(v_branch, v_item.id, 'x', 'x', 1, null, v_item.photo_path, 'x')).product_name = 'ถุงหิ้ว S',
         'retry must return original item';
  select count(*) into v_count from stock_request.bill_items where bill_id = v_bill.id;
  assert v_count = 1, 'retry must not duplicate';

  -- 3) รูปของสาขาอื่นต้องถูกปฏิเสธ
  begin
    perform stock_request.add_branch_item(v_branch, gen_random_uuid(), 'a', 'b', 1, null, '999/' || v_month || '/' || gen_random_uuid() || '.jpg', 'x');
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_INVALID_PHOTO', 'foreign photo path must fail';

  -- 4) HQ แก้จำนวนจัดส่ง (ก่อนตัด ไม่ต้องมีเหตุผล) และ stock_on_hand ไม่ถูกทับ
  select version into v_version from stock_request.bills where id = v_bill.id;
  v_res := stock_request.hq_update_item(v_admin, v_item.id, v_version, '{"hq_ship_qty": 10}', null);
  select * into v_item from stock_request.bill_items where id = v_item.id;
  assert v_item.hq_ship_qty = 10 and v_item.stock_on_hand = 4, 'ship qty separate from stock on hand';

  -- 5) version เก่า → conflict
  begin
    perform stock_request.hq_update_item(v_admin, v_item.id, v_version, '{"hq_note": "x"}', null);
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_VERSION_CONFLICT', 'stale version must fail';

  -- 6) แอดมินที่ปิดใช้งานทำรายการไม่ได้
  begin
    perform stock_request.cut_bill(v_admin2, v_bill.id, (v_res ->> 'version')::int);
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_ADMIN_FORBIDDEN', 'inactive admin must fail';

  -- 7) สินค้าทดแทน (สินค้าเดิมยังอยู่)
  v_res := stock_request.hq_set_substitution(v_admin, v_item.id, (v_res ->> 'version')::int, 'ถุงหิ้ว M', 'SP-3397', 8, null, 'S หมดสต็อก');
  v_res := stock_request.hq_set_substitution(v_admin, v_item.id, (v_res ->> 'version')::int, 'ถุงหิ้ว L', 'SP-3398', 5, null, 'M ก็หมด');
  select count(*) into v_count from stock_request.item_substitutions where bill_item_id = v_item.id;
  assert v_count = 2, 'substitution history kept';
  select count(*) into v_count from stock_request.item_substitutions where bill_item_id = v_item.id and is_active;
  assert v_count = 1, 'only one active substitution';

  -- 8) สาขาเพิ่มรายการระหว่าง HQ ตรวจ → ตัดด้วย version เดิมไม่ได้
  v_version := (v_res ->> 'version')::int;
  perform stock_request.add_branch_item(v_branch, v_item2, 'เทปใส', 'TP-01', 0, 'หมดเกลี้ยง',
            v_branch || '/' || v_month || '/' || gen_random_uuid() || '.jpg', 'พนักงานทดสอบ');
  begin
    perform stock_request.cut_bill(v_admin, v_bill.id, v_version);
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_VERSION_CONFLICT', 'cut with stale version must fail';

  -- 9) ตัดบิล → billed + snapshot + เปิดบิลใหม่
  select version into v_version from stock_request.bills where id = v_bill.id;
  v_res := stock_request.cut_bill(v_admin, v_bill.id, v_version);
  select * into v_bill from stock_request.bills where id = v_bill.id;
  assert v_bill.status = 'billed' and v_bill.billed_by = v_admin, 'bill billed';
  assert exists (select 1 from stock_request.bill_snapshots where bill_id = v_bill.id), 'snapshot saved';
  assert (v_res ->> 'new_bill_id')::uuid <> v_bill.id, 'new bill opened';
  assert (select status from stock_request.bills where id = (v_res ->> 'new_bill_id')::uuid) = 'pending', 'new bill pending';

  -- 10) กดตัดซ้ำ → error
  begin
    perform stock_request.cut_bill(v_admin, v_bill.id, v_bill.version);
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_ALREADY_BILLED', 'double cut must fail';

  -- 11) แก้หลังตัดต้องมีเหตุผล + ไม่กลับเป็น pending
  begin
    perform stock_request.hq_update_item(v_admin, v_item2, v_bill.version, '{"hq_ship_qty": 3}', '  ');
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_REASON_REQUIRED', 'reason required after billing';
  v_res := stock_request.hq_update_item(v_admin, v_item2, v_bill.version, '{"hq_ship_qty": 3}', 'สต็อกเหลือ 3');
  assert (select status from stock_request.bills where id = v_bill.id) = 'billed', 'still billed';
  assert exists (select 1 from stock_request.audit_logs where bill_id = v_bill.id and after_billing and reason = 'สต็อกเหลือ 3'), 'audit after billing';

  -- 12) audit log แก้ไม่ได้
  begin
    update stock_request.audit_logs set reason = 'hack' where bill_id = v_bill.id;
    v_failed := false;
  exception when others then v_failed := true;
  end;
  assert v_failed, 'audit log must be immutable';

  -- 13) ยืนยันรับก่อนจัดส่งไม่ได้ / จัดส่ง / ยืนยันรับ
  begin
    perform stock_request.confirm_received(v_branch, v_bill.id, 'พนักงานทดสอบ');
    v_failed := false;
  exception when others then v_failed := true; v_err := sqlerrm;
  end;
  assert v_failed and v_err = 'SR_INVALID_STATUS', 'receive before ship must fail';
  select version into v_version from stock_request.bills where id = v_bill.id;
  perform stock_request.mark_shipped(v_admin, v_bill.id, v_version);
  v_res := stock_request.confirm_received(v_branch, v_bill.id, 'พนักงานทดสอบ');
  assert (select status from stock_request.bills where id = v_bill.id) = 'received', 'received';

  -- 14) กฎ 3 บิล: ทำอีก 3 บิลจนรับครบ → บิลแรกต้องถูกลบ และรูปเข้าคิวลบ
  for i in 1..3 loop
    v_bill := stock_request.get_or_open_bill(v_branch);
    perform stock_request.add_branch_item(v_branch, gen_random_uuid(), 'สินค้า ' || i, 'C-' || i, 1, null,
              v_branch || '/' || v_month || '/' || gen_random_uuid() || '.jpg', 'พนักงานทดสอบ');
    select * into v_bill from stock_request.bills where id = v_bill.id;
    perform stock_request.cut_bill(v_admin, v_bill.id, v_bill.version);
    select * into v_bill from stock_request.bills where id = v_bill.id;
    perform stock_request.mark_shipped(v_admin, v_bill.id, v_bill.version);
    v_res := stock_request.confirm_received(v_branch, v_bill.id, 'พนักงานทดสอบ');
  end loop;
  assert (v_res ->> 'purged_bills')::int = 1, 'oldest bill purged';
  assert not exists (select 1 from stock_request.bills where id = v_first_bill), 'first bill deleted';
  select count(*) into v_count from stock_request.storage_cleanup_queue where reason = 'history_limit' and processed_at is null;
  assert v_count >= 2, 'photos queued for deletion';
  select count(*) into v_count from stock_request.bills where branch_id = v_branch and status <> 'pending';
  assert v_count = 3, 'exactly 3 bills in history';

  raise notice 'ALL STOCK REQUEST TESTS PASSED';
end;
$$;

-- 15) สิทธิ์: anon เข้า schema ไม่ได้ / authenticated ที่ไม่ใช่ admin มองไม่เห็นบิล
do $$
declare
  v_failed boolean;
  v_count  integer;
begin
  set local role anon;
  begin
    perform 1 from stock_request.bills limit 1;
    v_failed := false;
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  assert v_failed, 'anon must not read stock_request';

  set local role authenticated;
  perform set_config('request.jwt.claim.sub', gen_random_uuid()::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', current_setting('request.jwt.claim.sub'))::text, true);
  select count(*) into v_count from stock_request.bills;
  reset role;
  assert v_count = 0, 'non-admin must see nothing';

  set local role authenticated;
  begin
    perform stock_request.cut_bill(gen_random_uuid(), gen_random_uuid(), 1);
    v_failed := false;
  exception when insufficient_privilege then v_failed := true;
  end;
  reset role;
  assert v_failed, 'authenticated must not call write functions';

  raise notice 'PERMISSION TESTS PASSED';
end;
$$;

rollback;
