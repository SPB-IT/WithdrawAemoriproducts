-- =====================================================================
-- ระบบแจ้งสินค้าใกล้หมด (Stock Request) — โครงสร้างฐานข้อมูลเริ่มต้น
--
-- * ทุกอย่างอยู่ใน schema `stock_request` แยกจากระบบเบิกสินค้าเดิม (public)
-- * แตะ public เพียงอย่างเดียว: FK อ่านอย่างเดียวไปที่ public.branches(id)
-- * การเขียนข้อมูลทั้งหมดทำผ่าน function (เรียกได้เฉพาะ service_role จาก API ฝั่ง server)
-- * หลังรัน: Supabase Dashboard → Project Settings → Data API → Exposed schemas → เพิ่ม stock_request
-- =====================================================================

create schema if not exists stock_request;
comment on schema stock_request is 'ระบบแจ้งสินค้าใกล้หมด (Stock Request) — แยกจากระบบเบิกสินค้า Aemori เดิมใน public';

revoke all on schema stock_request from public;
grant usage on schema stock_request to authenticated, service_role;

alter default privileges in schema stock_request revoke execute on functions from public;

-- ---------------------------------------------------------------------
-- Enum
-- ---------------------------------------------------------------------
create type stock_request.bill_status as enum ('pending', 'billed', 'shipped', 'received');

create type stock_request.audit_action as enum (
  'item_add', 'item_update', 'item_remove', 'item_restore',
  'ship_qty_change', 'substitution_set', 'substitution_remove',
  'note_update', 'bill_cut', 'status_change'
);

create type stock_request.admin_role as enum ('admin', 'super_admin');
create type stock_request.item_source as enum ('branch', 'hq');
create type stock_request.notification_audience as enum ('hq', 'branch');

-- ---------------------------------------------------------------------
-- Utility: updated_at
-- ---------------------------------------------------------------------
create or replace function stock_request.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------

-- ผู้ดูแลสำนักงานใหญ่ (ผูก 1:1 กับ Supabase Auth)
create table stock_request.admin_profiles (
  id            uuid primary key references auth.users (id) on delete restrict,
  display_name  text not null check (char_length(btrim(display_name)) between 1 and 100),
  email         text,
  role          stock_request.admin_role not null default 'admin',
  is_active     boolean not null default true,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);
comment on table stock_request.admin_profiles is 'บัญชีผู้ดูแล HQ — ปิดใช้งานด้วย is_active แทนการลบ เพื่อเก็บประวัติ';

-- ตัวนับเลขบิลรายสาขา/รายวัน
create table stock_request.bill_counters (
  branch_id  bigint not null references public.branches (id) on delete restrict,
  bill_date  date not null,
  last_no    integer not null default 0,
  primary key (branch_id, bill_date)
);

-- บิลหลัก
create table stock_request.bills (
  id                uuid primary key default gen_random_uuid(),
  bill_no           text not null unique,
  branch_id         bigint not null references public.branches (id) on delete restrict,
  status            stock_request.bill_status not null default 'pending',
  version           integer not null default 1 check (version > 0),
  billed_at         timestamptz,
  billed_by         uuid references stock_request.admin_profiles (id) on delete restrict,
  shipped_at        timestamptz,
  shipped_by        uuid references stock_request.admin_profiles (id) on delete restrict,
  received_at       timestamptz,
  received_by_name  text check (received_by_name is null or char_length(btrim(received_by_name)) between 1 and 100),
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint bills_billed_fields check (status = 'pending' or (billed_at is not null and billed_by is not null)),
  constraint bills_shipped_fields check (status not in ('shipped', 'received') or (shipped_at is not null and shipped_by is not null)),
  constraint bills_received_fields check (status <> 'received' or (received_at is not null and received_by_name is not null))
);
comment on column stock_request.bills.version is 'เพิ่มทุกครั้งที่บิลหรือรายการเปลี่ยน ใช้กันการแก้ไขพร้อมกัน';

-- 1 สาขามีบิลเปิดได้เพียง 1 บิล
create unique index bills_one_pending_per_branch on stock_request.bills (branch_id) where status = 'pending';
create index bills_branch_created_idx on stock_request.bills (branch_id, created_at desc);
create index bills_status_created_idx on stock_request.bills (status, created_at desc);
create index bills_created_idx on stock_request.bills (created_at desc);

-- รายการสินค้าในบิล
create table stock_request.bill_items (
  id                uuid primary key default gen_random_uuid(),
  bill_id           uuid not null references stock_request.bills (id) on delete cascade,
  branch_id         bigint not null,
  product_name      text not null check (char_length(product_name) between 1 and 200),
  product_code      text not null check (char_length(product_code) between 1 and 100),
  stock_on_hand     integer check (stock_on_hand >= 0),
  staff_note        text check (staff_note is null or char_length(staff_note) <= 1000),
  photo_path        text,
  reported_by_name  text not null check (char_length(reported_by_name) between 1 and 100),
  source            stock_request.item_source not null default 'branch',
  created_by_admin  uuid references stock_request.admin_profiles (id) on delete restrict,
  hq_ship_qty       integer check (hq_ship_qty >= 0),
  hq_note           text check (hq_note is null or char_length(hq_note) <= 1000),
  is_removed        boolean not null default false,
  removed_at        timestamptz,
  removed_by        uuid references stock_request.admin_profiles (id) on delete restrict,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),
  constraint bill_items_branch_source check (source = 'hq' or (stock_on_hand is not null and photo_path is not null)),
  constraint bill_items_hq_source check (source = 'branch' or created_by_admin is not null),
  constraint bill_items_removed_fields check (not is_removed or (removed_at is not null and removed_by is not null))
);
comment on column stock_request.bill_items.stock_on_hand is 'จำนวนคงเหลือหน้าร้านที่สาขาระบุ ณ เวลาบันทึก';
comment on column stock_request.bill_items.hq_ship_qty is 'จำนวนที่สำนักงานใหญ่จะจัดส่ง (คนละช่องกับ stock_on_hand)';

create index bill_items_bill_active_idx on stock_request.bill_items (bill_id, created_at) where not is_removed;
create index bill_items_branch_created_idx on stock_request.bill_items (branch_id, created_at desc);
create index bill_items_product_code_idx on stock_request.bill_items (product_code);

-- สินค้าทดแทน (เก็บทุกครั้ง ไม่ลบสินค้าเดิม)
create table stock_request.item_substitutions (
  id              uuid primary key default gen_random_uuid(),
  bill_item_id    uuid not null references stock_request.bill_items (id) on delete cascade,
  product_name    text not null check (char_length(product_name) between 1 and 200),
  product_code    text not null check (char_length(product_code) between 1 and 100),
  photo_path      text,
  ship_qty        integer not null check (ship_qty >= 0),
  reason          text not null check (char_length(btrim(reason)) between 1 and 1000),
  is_active       boolean not null default true,
  created_by      uuid not null references stock_request.admin_profiles (id) on delete restrict,
  created_at      timestamptz not null default now(),
  deactivated_at  timestamptz,
  constraint item_substitutions_active_fields check (is_active or deactivated_at is not null)
);
create unique index item_substitutions_one_active on stock_request.item_substitutions (bill_item_id) where is_active;
create index item_substitutions_item_idx on stock_request.item_substitutions (bill_item_id, created_at);

-- สำเนารายการ ณ เวลาตัดบิล
create table stock_request.bill_snapshots (
  id        uuid primary key default gen_random_uuid(),
  bill_id   uuid not null unique references stock_request.bills (id) on delete cascade,
  data      jsonb not null,
  taken_by  uuid not null references stock_request.admin_profiles (id) on delete restrict,
  taken_at  timestamptz not null default now()
);

-- Audit log (insert-only)
create table stock_request.audit_logs (
  id             uuid primary key default gen_random_uuid(),
  bill_id        uuid not null references stock_request.bills (id) on delete cascade,
  bill_item_id   uuid,
  admin_id       uuid not null references stock_request.admin_profiles (id) on delete restrict,
  admin_name     text not null,
  action         stock_request.audit_action not null,
  before_data    jsonb,
  after_data     jsonb,
  reason         text check (reason is null or char_length(reason) <= 1000),
  after_billing  boolean not null default false,
  created_at     timestamptz not null default now(),
  constraint audit_logs_reason_after_billing check (not after_billing or (reason is not null and char_length(btrim(reason)) > 0))
);
create index audit_logs_bill_created_idx on stock_request.audit_logs (bill_id, created_at desc);
create index audit_logs_admin_created_idx on stock_request.audit_logs (admin_id, created_at desc);
create index audit_logs_created_idx on stock_request.audit_logs (created_at desc);

-- ประวัติสถานะบิล
create table stock_request.status_logs (
  id           uuid primary key default gen_random_uuid(),
  bill_id      uuid not null references stock_request.bills (id) on delete cascade,
  from_status  stock_request.bill_status,
  to_status    stock_request.bill_status not null,
  admin_id     uuid references stock_request.admin_profiles (id) on delete restrict,
  actor_name   text not null,
  changed_at   timestamptz not null default now()
);
create index status_logs_bill_idx on stock_request.status_logs (bill_id, changed_at);

-- แจ้งเตือนภายในเว็บ
create table stock_request.notifications (
  id              uuid primary key default gen_random_uuid(),
  audience        stock_request.notification_audience not null,
  branch_id       bigint references public.branches (id) on delete cascade,
  bill_id         uuid references stock_request.bills (id) on delete cascade,
  type            text not null,
  title           text not null,
  body            text,
  branch_read_at  timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  constraint notifications_branch_target check (audience = 'hq' or branch_id is not null)
);
-- รวมแจ้งเตือน "มีรายการใหม่" เป็น 1 อันต่อบิล
create unique index notifications_hq_new_items_per_bill on stock_request.notifications (bill_id)
  where audience = 'hq' and type = 'new_items';
create index notifications_audience_created_idx on stock_request.notifications (audience, created_at desc);
create index notifications_branch_created_idx on stock_request.notifications (branch_id, created_at desc)
  where audience = 'branch';

create table stock_request.notification_reads (
  notification_id  uuid not null references stock_request.notifications (id) on delete cascade,
  admin_id         uuid not null references stock_request.admin_profiles (id) on delete cascade,
  read_at          timestamptz not null default now(),
  primary key (notification_id, admin_id)
);
create index notification_reads_admin_idx on stock_request.notification_reads (admin_id);

-- คิวลบไฟล์รูปใน Storage หลังลบบิล
create table stock_request.storage_cleanup_queue (
  id            uuid primary key default gen_random_uuid(),
  bucket        text not null,
  path          text not null,
  reason        text not null,
  attempts      integer not null default 0,
  last_error    text,
  created_at    timestamptz not null default now(),
  processed_at  timestamptz
);
create index storage_cleanup_pending_idx on stock_request.storage_cleanup_queue (created_at) where processed_at is null;

-- เตรียมไว้สำหรับ login สาขาในอนาคต (ยังไม่ใช้)
create table stock_request.branch_members (
  user_id     uuid not null references auth.users (id) on delete cascade,
  branch_id   bigint not null references public.branches (id) on delete cascade,
  role        text not null default 'staff',
  created_at  timestamptz not null default now(),
  primary key (user_id, branch_id)
);

-- ---------------------------------------------------------------------
-- Triggers
-- ---------------------------------------------------------------------
create trigger admin_profiles_touch before update on stock_request.admin_profiles
  for each row execute function stock_request.touch_updated_at();
create trigger bills_touch before update on stock_request.bills
  for each row execute function stock_request.touch_updated_at();
create trigger bill_items_touch before update on stock_request.bill_items
  for each row execute function stock_request.touch_updated_at();
create trigger notifications_touch before update on stock_request.notifications
  for each row execute function stock_request.touch_updated_at();

-- bill_items.branch_id ต้องตรงกับบิลเสมอ
create or replace function stock_request.sync_item_branch()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select b.branch_id into new.branch_id from stock_request.bills b where b.id = new.bill_id;
  if new.branch_id is null then
    raise exception 'bill % not found', new.bill_id;
  end if;
  return new;
end;
$$;
create trigger bill_items_sync_branch before insert or update of bill_id on stock_request.bill_items
  for each row execute function stock_request.sync_item_branch();

-- ประวัติห้ามแก้ไข / ห้ามลบ (ยกเว้นระหว่างลบบิลตามกฎ 3 บิล)
create or replace function stock_request.protect_history()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' and coalesce(current_setting('stock_request.allow_purge', true), '') = 'on' then
    return old;
  end if;
  raise exception 'ตาราง % เป็นข้อมูลประวัติ ไม่สามารถแก้ไขหรือลบได้', tg_table_name
    using errcode = 'P0001';
end;
$$;
create trigger audit_logs_protect before update or delete on stock_request.audit_logs
  for each row execute function stock_request.protect_history();
create trigger status_logs_protect before update or delete on stock_request.status_logs
  for each row execute function stock_request.protect_history();
create trigger bill_snapshots_protect before update or delete on stock_request.bill_snapshots
  for each row execute function stock_request.protect_history();

-- ---------------------------------------------------------------------
-- Helper functions
-- รหัส error: message = 'SR_xxx', detail = ข้อความภาษาไทยสำหรับแสดงผล
-- ---------------------------------------------------------------------
create or replace function stock_request.fail(p_code text, p_detail text)
returns void
language plpgsql
set search_path = ''
as $$
begin
  raise exception using errcode = 'P0001', message = p_code, detail = p_detail;
end;
$$;

create or replace function stock_request.clean_text(p_value text, p_max integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select case
    when p_value is null or btrim(p_value) = '' then null
    else left(btrim(p_value), p_max)
  end
$$;

-- path รูปต้องอยู่ในโฟลเดอร์ของสาขานั้น: {branch_id}/{YYYYMM}/{uuid}.{jpg|png|webp}
create or replace function stock_request.valid_photo_path(p_branch_id bigint, p_path text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select p_path is not null
     and p_path ~ ('^' || p_branch_id::text || '/[0-9]{6}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\.(jpg|png|webp)$')
$$;

create or replace function stock_request.is_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from stock_request.admin_profiles a
    where a.id = auth.uid() and a.is_active
  )
$$;

create or replace function stock_request.require_admin(p_admin_id uuid)
returns stock_request.admin_profiles
language plpgsql
stable
set search_path = ''
as $$
declare
  v_admin stock_request.admin_profiles;
begin
  select * into v_admin from stock_request.admin_profiles where id = p_admin_id;
  if not found or not v_admin.is_active then
    perform stock_request.fail('SR_ADMIN_FORBIDDEN', 'บัญชีนี้ไม่มีสิทธิ์ผู้ดูแลระบบ');
  end if;
  return v_admin;
end;
$$;

create or replace function stock_request.require_branch(p_branch_id bigint)
returns text
language plpgsql
stable
set search_path = ''
as $$
declare
  v_name text;
begin
  select b.name into v_name from public.branches b where b.id = p_branch_id;
  if v_name is null then
    perform stock_request.fail('SR_BRANCH_NOT_FOUND', 'ไม่พบสาขาที่เลือก');
  end if;
  return v_name;
end;
$$;

-- ล็อกบิล (FOR UPDATE) ภายใน transaction ของ function ที่เรียก
create or replace function stock_request.lock_bill(p_bill_id uuid)
returns stock_request.bills
language plpgsql
set search_path = ''
as $$
declare
  v_bill stock_request.bills;
begin
  select * into v_bill from stock_request.bills where id = p_bill_id for update;
  if not found then
    perform stock_request.fail('SR_BILL_NOT_FOUND', 'ไม่พบบิล');
  end if;
  return v_bill;
end;
$$;

create or replace function stock_request.check_version(p_bill stock_request.bills, p_expected integer)
returns void
language plpgsql
immutable
set search_path = ''
as $$
begin
  if p_expected is null or p_bill.version <> p_expected then
    perform stock_request.fail('SR_VERSION_CONFLICT', 'บิลนี้มีการเปลี่ยนแปลงก่อนหน้า กรุณาโหลดข้อมูลใหม่แล้วตรวจอีกครั้ง');
  end if;
end;
$$;

create or replace function stock_request.next_bill_no(p_branch_id bigint)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_day date := (now() at time zone 'Asia/Bangkok')::date;
  v_no  integer;
begin
  insert into stock_request.bill_counters as c (branch_id, bill_date, last_no)
  values (p_branch_id, v_day, 1)
  on conflict (branch_id, bill_date) do update set last_no = c.last_no + 1
  returning c.last_no into v_no;

  return format('AMR-%s-%s-%s',
    lpad(p_branch_id::text, 2, '0'),
    to_char(v_day, 'YYMMDD'),
    lpad(v_no::text, 3, '0'));
end;
$$;

create or replace function stock_request.notify_branch(p_bill stock_request.bills, p_type text, p_title text, p_body text)
returns void
language sql
set search_path = ''
as $$
  insert into stock_request.notifications (audience, branch_id, bill_id, type, title, body)
  values ('branch', p_bill.branch_id, p_bill.id, p_type, p_title, p_body);
$$;

create or replace function stock_request.notify_hq(p_bill stock_request.bills, p_type text, p_title text, p_body text)
returns void
language sql
set search_path = ''
as $$
  insert into stock_request.notifications (audience, branch_id, bill_id, type, title, body)
  values ('hq', p_bill.branch_id, p_bill.id, p_type, p_title, p_body);
$$;

-- บันทึก audit + เพิ่ม version + แจ้งสาขาเมื่อแก้หลังตัดบิล
-- (ผู้เรียกต้องล็อกบิลไว้แล้ว)
create or replace function stock_request.record_hq_change(
  p_bill_id   uuid,
  p_admin     stock_request.admin_profiles,
  p_item_id   uuid,
  p_action    stock_request.audit_action,
  p_before    jsonb,
  p_after     jsonb,
  p_reason    text
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_bill           stock_request.bills;
  v_after_billing  boolean;
  v_reason         text := stock_request.clean_text(p_reason, 1000);
begin
  select * into v_bill from stock_request.bills where id = p_bill_id;
  v_after_billing := v_bill.status <> 'pending';

  if v_after_billing and v_reason is null then
    perform stock_request.fail('SR_REASON_REQUIRED', 'บิลนี้ตัดแล้ว ต้องระบุเหตุผลในการแก้ไขทุกครั้ง');
  end if;

  insert into stock_request.audit_logs
    (bill_id, bill_item_id, admin_id, admin_name, action, before_data, after_data, reason, after_billing)
  values
    (v_bill.id, p_item_id, p_admin.id, p_admin.display_name, p_action, p_before, p_after, v_reason, v_after_billing);

  update stock_request.bills set version = version + 1 where id = v_bill.id
  returning * into v_bill;

  if v_after_billing then
    perform stock_request.notify_branch(v_bill, 'bill_edited', 'สำนักงานใหญ่แก้ไขบิล',
      format('บิล %s: %s', v_bill.bill_no, v_reason));
  end if;

  return v_bill.version;
end;
$$;

create or replace function stock_request.bill_snapshot_json(p_bill_id uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_build_object(
    'bill', to_jsonb(b),
    'branch_name', br.name,
    'items', coalesce((
      select jsonb_agg(
        to_jsonb(i) || jsonb_build_object('substitution', (
          select to_jsonb(s) from stock_request.item_substitutions s
          where s.bill_item_id = i.id and s.is_active
        ))
        order by i.created_at)
      from stock_request.bill_items i
      where i.bill_id = b.id and not i.is_removed
    ), '[]'::jsonb)
  )
  from stock_request.bills b
  join public.branches br on br.id = b.branch_id
  where b.id = p_bill_id
$$;

-- ---------------------------------------------------------------------
-- ฝั่งสาขา
-- ---------------------------------------------------------------------

-- คืนบิลที่เปิดอยู่ของสาขา ถ้าไม่มีให้สร้างใหม่ (ปลอดภัยเมื่อเรียกพร้อมกัน)
create or replace function stock_request.get_or_open_bill(p_branch_id bigint)
returns stock_request.bills
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_bill stock_request.bills;
begin
  perform stock_request.require_branch(p_branch_id);

  select * into v_bill from stock_request.bills where branch_id = p_branch_id and status = 'pending';
  if found then
    return v_bill;
  end if;

  insert into stock_request.bills (branch_id, bill_no)
  values (p_branch_id, stock_request.next_bill_no(p_branch_id))
  on conflict (branch_id) where status = 'pending' do nothing
  returning * into v_bill;

  if v_bill.id is null then
    select * into v_bill from stock_request.bills where branch_id = p_branch_id and status = 'pending';
  else
    insert into stock_request.status_logs (bill_id, from_status, to_status, actor_name)
    values (v_bill.id, null, 'pending', 'ระบบ');
  end if;

  return v_bill;
end;
$$;

-- สาขาเพิ่มรายการ (บันทึกทันที) — ส่ง p_item_id เดิมซ้ำได้อย่างปลอดภัยเมื่อเน็ตหลุดแล้วกดใหม่
create or replace function stock_request.add_branch_item(
  p_branch_id      bigint,
  p_item_id        uuid,
  p_product_name   text,
  p_product_code   text,
  p_stock_on_hand  integer,
  p_staff_note     text,
  p_photo_path     text,
  p_staff_name     text
)
returns stock_request.bill_items
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_name  text;
  v_bill         stock_request.bills;
  v_item         stock_request.bill_items;
  v_name         text := stock_request.clean_text(p_product_name, 200);
  v_code         text := stock_request.clean_text(p_product_code, 100);
  v_note         text := stock_request.clean_text(p_staff_note, 1000);
  v_staff        text := stock_request.clean_text(p_staff_name, 100);
  v_count        integer;
  v_notification uuid;
  v_attempt      integer := 0;
begin
  v_branch_name := stock_request.require_branch(p_branch_id);

  if p_item_id is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'ไม่พบรหัสรายการ');
  end if;
  if v_name is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกชื่อสินค้า');
  end if;
  if v_code is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกรหัสสินค้า');
  end if;
  if p_stock_on_hand is null or p_stock_on_hand < 0 then
    perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนคงเหลือต้องเป็น 0 หรือมากกว่า');
  end if;
  if v_staff is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณาระบุชื่อพนักงาน');
  end if;
  if not stock_request.valid_photo_path(p_branch_id, p_photo_path) then
    perform stock_request.fail('SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง กรุณาถ่ายหรืออัปโหลดใหม่');
  end if;

  -- เคยบันทึกรายการนี้แล้ว (กดซ้ำ) → คืนรายการเดิม
  select * into v_item from stock_request.bill_items where id = p_item_id;
  if found then
    if v_item.branch_id <> p_branch_id then
      perform stock_request.fail('SR_INVALID_INPUT', 'รหัสรายการซ้ำ');
    end if;
    return v_item;
  end if;

  -- ล็อกบิลที่เปิดอยู่ ถ้าถูกตัดระหว่างรอ ให้ย้ายไปบิลใหม่
  loop
    v_attempt := v_attempt + 1;
    v_bill := stock_request.get_or_open_bill(p_branch_id);
    select * into v_bill from stock_request.bills where id = v_bill.id for update;
    exit when v_bill.status = 'pending';
    if v_attempt >= 3 then
      perform stock_request.fail('SR_BILL_BUSY', 'ระบบกำลังตัดบิล กรุณาลองใหม่อีกครั้ง');
    end if;
  end loop;

  insert into stock_request.bill_items
    (id, bill_id, branch_id, product_name, product_code, stock_on_hand, staff_note, photo_path, reported_by_name, source)
  values
    (p_item_id, v_bill.id, p_branch_id, v_name, v_code, p_stock_on_hand, v_note, p_photo_path, v_staff, 'branch')
  returning * into v_item;

  -- รายการใหม่ทำให้ HQ ต้องตรวจใหม่ก่อนตัดบิล
  update stock_request.bills set version = version + 1 where id = v_bill.id returning * into v_bill;

  select count(*) into v_count from stock_request.bill_items where bill_id = v_bill.id and not is_removed;

  insert into stock_request.notifications (audience, branch_id, bill_id, type, title, body)
  values ('hq', p_branch_id, v_bill.id, 'new_items', 'มีรายการเบิกใหม่',
          format('%s · บิล %s มี %s รายการรอตัดบิล', v_branch_name, v_bill.bill_no, v_count))
  on conflict (bill_id) where audience = 'hq' and type = 'new_items'
  do update set body = excluded.body, created_at = now()
  returning id into v_notification;

  -- ให้แจ้งเตือนกลับเป็น "ยังไม่อ่าน"
  delete from stock_request.notification_reads where notification_id = v_notification;

  return v_item;
end;
$$;

-- สาขายืนยันรับสินค้า → ล้างประวัติเก่าเกิน 3 บิล
create or replace function stock_request.confirm_received(p_branch_id bigint, p_bill_id uuid, p_staff_name text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_branch_name text;
  v_bill        stock_request.bills;
  v_staff       text := stock_request.clean_text(p_staff_name, 100);
  v_purged      integer;
begin
  v_branch_name := stock_request.require_branch(p_branch_id);
  if v_staff is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณาระบุชื่อพนักงาน');
  end if;

  v_bill := stock_request.lock_bill(p_bill_id);
  if v_bill.branch_id <> p_branch_id then
    perform stock_request.fail('SR_BILL_NOT_FOUND', 'ไม่พบบิล');
  end if;
  if v_bill.status = 'received' then
    perform stock_request.fail('SR_ALREADY_RECEIVED', 'บิลนี้ยืนยันรับสินค้าแล้ว');
  end if;
  if v_bill.status <> 'shipped' then
    perform stock_request.fail('SR_INVALID_STATUS', 'ยืนยันรับได้เฉพาะบิลที่จัดส่งแล้ว');
  end if;

  update stock_request.bills
     set status = 'received', received_at = now(), received_by_name = v_staff, version = version + 1
   where id = v_bill.id
  returning * into v_bill;

  insert into stock_request.status_logs (bill_id, from_status, to_status, actor_name)
  values (v_bill.id, 'shipped', 'received', v_staff);

  perform stock_request.notify_hq(v_bill, 'received', 'สาขายืนยันรับสินค้า',
    format('%s · บิล %s ได้รับสินค้าแล้ว (%s)', v_branch_name, v_bill.bill_no, v_staff));

  v_purged := stock_request.enforce_history_limit(p_branch_id);

  return jsonb_build_object('bill_id', v_bill.id, 'status', v_bill.status, 'version', v_bill.version, 'purged_bills', v_purged);
end;
$$;

-- เก็บประวัติ 3 บิลล่าสุดต่อสาขา: ลบเฉพาะบิล received ที่อยู่นอก 3 บิลล่าสุด
-- (บิล pending/billed/shipped ไม่ถูกลบ) รูปที่เกี่ยวข้องถูกส่งเข้าคิวลบ Storage
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
    select b.id, b.status,
           row_number() over (order by b.created_at desc, b.bill_no desc) as rn
    from stock_request.bills b
    where b.branch_id = p_branch_id and b.status <> 'pending'
  ) r
  where r.rn > 3 and r.status = 'received';

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

-- ---------------------------------------------------------------------
-- ฝั่งสำนักงานใหญ่ (HQ)
-- ---------------------------------------------------------------------

create or replace function stock_request.hq_add_item(
  p_admin_id          uuid,
  p_bill_id           uuid,
  p_expected_version  integer,
  p_item_id           uuid,
  p_product_name      text,
  p_product_code      text,
  p_stock_on_hand     integer,
  p_hq_ship_qty       integer,
  p_hq_note           text,
  p_photo_path        text,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill     stock_request.bills;
  v_item     stock_request.bill_items;
  v_name     text := stock_request.clean_text(p_product_name, 200);
  v_code     text := stock_request.clean_text(p_product_code, 100);
  v_version  integer;
begin
  v_bill := stock_request.lock_bill(p_bill_id);
  perform stock_request.check_version(v_bill, p_expected_version);

  if v_name is null or v_code is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกชื่อและรหัสสินค้า');
  end if;
  if (p_stock_on_hand is not null and p_stock_on_hand < 0) or (p_hq_ship_qty is not null and p_hq_ship_qty < 0) then
    perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนต้องเป็น 0 หรือมากกว่า');
  end if;
  if p_photo_path is not null and not stock_request.valid_photo_path(v_bill.branch_id, p_photo_path) then
    perform stock_request.fail('SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
  end if;

  insert into stock_request.bill_items
    (id, bill_id, branch_id, product_name, product_code, stock_on_hand, photo_path,
     reported_by_name, source, created_by_admin, hq_ship_qty, hq_note)
  values
    (coalesce(p_item_id, gen_random_uuid()), v_bill.id, v_bill.branch_id, v_name, v_code, p_stock_on_hand, p_photo_path,
     v_admin.display_name, 'hq', v_admin.id, p_hq_ship_qty, stock_request.clean_text(p_hq_note, 1000))
  returning * into v_item;

  v_version := stock_request.record_hq_change(v_bill.id, v_admin, v_item.id, 'item_add', null, to_jsonb(v_item), p_reason);
  return jsonb_build_object('version', v_version, 'item_id', v_item.id);
end;
$$;

-- แก้ไขรายการ: p_patch รับ key ได้เฉพาะ product_name, product_code, stock_on_hand, hq_ship_qty, hq_note
create or replace function stock_request.hq_update_item(
  p_admin_id          uuid,
  p_item_id           uuid,
  p_expected_version  integer,
  p_patch             jsonb,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill_id  uuid;
  v_bill     stock_request.bills;
  v_item     stock_request.bill_items;
  v_new      stock_request.bill_items;
  v_keys     text[];
  v_before   jsonb;
  v_after    jsonb;
  v_action   stock_request.audit_action;
  v_version  integer;
begin
  if p_patch is null or jsonb_typeof(p_patch) <> 'object' or p_patch = '{}'::jsonb then
    perform stock_request.fail('SR_INVALID_INPUT', 'ไม่มีข้อมูลที่ต้องแก้ไข');
  end if;
  select array_agg(k order by k) into v_keys from jsonb_object_keys(p_patch) k;
  if exists (select 1 from unnest(v_keys) k
             where k not in ('product_name', 'product_code', 'stock_on_hand', 'hq_ship_qty', 'hq_note')) then
    perform stock_request.fail('SR_INVALID_INPUT', 'มีช่องข้อมูลที่ไม่อนุญาตให้แก้ไข');
  end if;

  select bill_id into v_bill_id from stock_request.bill_items where id = p_item_id;
  if v_bill_id is null then
    perform stock_request.fail('SR_ITEM_NOT_FOUND', 'ไม่พบรายการสินค้า');
  end if;
  v_bill := stock_request.lock_bill(v_bill_id);
  perform stock_request.check_version(v_bill, p_expected_version);

  select * into v_item from stock_request.bill_items where id = p_item_id for update;
  if v_item.is_removed then
    perform stock_request.fail('SR_ITEM_REMOVED', 'รายการนี้ถูกลบแล้ว');
  end if;

  v_new := v_item;
  begin
    if p_patch ? 'product_name' then
      v_new.product_name := stock_request.clean_text(p_patch ->> 'product_name', 200);
      if v_new.product_name is null then
        perform stock_request.fail('SR_INVALID_INPUT', 'ชื่อสินค้าห้ามว่าง');
      end if;
    end if;
    if p_patch ? 'product_code' then
      v_new.product_code := stock_request.clean_text(p_patch ->> 'product_code', 100);
      if v_new.product_code is null then
        perform stock_request.fail('SR_INVALID_INPUT', 'รหัสสินค้าห้ามว่าง');
      end if;
    end if;
    if p_patch ? 'stock_on_hand' then
      v_new.stock_on_hand := (p_patch ->> 'stock_on_hand')::integer;
      if v_new.stock_on_hand is null and v_item.source = 'branch' then
        perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนคงเหลือห้ามว่าง');
      end if;
    end if;
    if p_patch ? 'hq_ship_qty' then
      v_new.hq_ship_qty := (p_patch ->> 'hq_ship_qty')::integer;
    end if;
    if p_patch ? 'hq_note' then
      v_new.hq_note := stock_request.clean_text(p_patch ->> 'hq_note', 1000);
    end if;
  exception
    when invalid_text_representation or numeric_value_out_of_range then
      perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนต้องเป็นตัวเลขจำนวนเต็ม');
  end;

  if coalesce(v_new.stock_on_hand, 0) < 0 or coalesce(v_new.hq_ship_qty, 0) < 0 then
    perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนต้องเป็น 0 หรือมากกว่า');
  end if;

  select jsonb_object_agg(k, to_jsonb(v_item) -> k), jsonb_object_agg(k, to_jsonb(v_new) -> k)
    into v_before, v_after
  from unnest(v_keys) k;

  if v_before = v_after then
    return jsonb_build_object('version', v_bill.version, 'changed', false);
  end if;

  update stock_request.bill_items
     set product_name = v_new.product_name,
         product_code = v_new.product_code,
         stock_on_hand = v_new.stock_on_hand,
         hq_ship_qty = v_new.hq_ship_qty,
         hq_note = v_new.hq_note
   where id = p_item_id;

  v_action := case
    when v_keys = array['hq_ship_qty'] then 'ship_qty_change'
    when v_keys = array['hq_note'] then 'note_update'
    else 'item_update'
  end;

  v_version := stock_request.record_hq_change(v_bill.id, v_admin, p_item_id, v_action, v_before, v_after, p_reason);
  return jsonb_build_object('version', v_version, 'changed', true);
end;
$$;

create or replace function stock_request.hq_set_item_removed(
  p_admin_id          uuid,
  p_item_id           uuid,
  p_expected_version  integer,
  p_removed           boolean,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill_id  uuid;
  v_bill     stock_request.bills;
  v_item     stock_request.bill_items;
  v_version  integer;
begin
  select bill_id into v_bill_id from stock_request.bill_items where id = p_item_id;
  if v_bill_id is null then
    perform stock_request.fail('SR_ITEM_NOT_FOUND', 'ไม่พบรายการสินค้า');
  end if;
  v_bill := stock_request.lock_bill(v_bill_id);
  perform stock_request.check_version(v_bill, p_expected_version);

  select * into v_item from stock_request.bill_items where id = p_item_id for update;
  if v_item.is_removed = p_removed then
    return jsonb_build_object('version', v_bill.version, 'changed', false);
  end if;

  update stock_request.bill_items
     set is_removed = p_removed,
         removed_at = case when p_removed then now() end,
         removed_by = case when p_removed then v_admin.id end
   where id = p_item_id;

  v_version := stock_request.record_hq_change(
    v_bill.id, v_admin, p_item_id,
    case when p_removed then 'item_remove'::stock_request.audit_action else 'item_restore'::stock_request.audit_action end,
    jsonb_build_object('is_removed', v_item.is_removed),
    jsonb_build_object('is_removed', p_removed),
    p_reason);
  return jsonb_build_object('version', v_version, 'changed', true);
end;
$$;

create or replace function stock_request.hq_set_substitution(
  p_admin_id          uuid,
  p_item_id           uuid,
  p_expected_version  integer,
  p_product_name      text,
  p_product_code      text,
  p_ship_qty          integer,
  p_photo_path        text,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill_id  uuid;
  v_bill     stock_request.bills;
  v_item     stock_request.bill_items;
  v_old      stock_request.item_substitutions;
  v_sub      stock_request.item_substitutions;
  v_name     text := stock_request.clean_text(p_product_name, 200);
  v_code     text := stock_request.clean_text(p_product_code, 100);
  v_reason   text := stock_request.clean_text(p_reason, 1000);
  v_version  integer;
begin
  select bill_id into v_bill_id from stock_request.bill_items where id = p_item_id;
  if v_bill_id is null then
    perform stock_request.fail('SR_ITEM_NOT_FOUND', 'ไม่พบรายการสินค้า');
  end if;
  v_bill := stock_request.lock_bill(v_bill_id);
  perform stock_request.check_version(v_bill, p_expected_version);

  select * into v_item from stock_request.bill_items where id = p_item_id;
  if v_item.is_removed then
    perform stock_request.fail('SR_ITEM_REMOVED', 'รายการนี้ถูกลบแล้ว');
  end if;
  if v_name is null or v_code is null then
    perform stock_request.fail('SR_INVALID_INPUT', 'กรุณากรอกชื่อและรหัสสินค้าทดแทน');
  end if;
  if p_ship_qty is null or p_ship_qty < 0 then
    perform stock_request.fail('SR_INVALID_INPUT', 'จำนวนจัดส่งต้องเป็น 0 หรือมากกว่า');
  end if;
  if v_reason is null then
    perform stock_request.fail('SR_REASON_REQUIRED', 'กรุณาระบุเหตุผลในการเปลี่ยนสินค้า');
  end if;
  if p_photo_path is not null and not stock_request.valid_photo_path(v_bill.branch_id, p_photo_path) then
    perform stock_request.fail('SR_INVALID_PHOTO', 'รูปภาพไม่ถูกต้อง');
  end if;

  update stock_request.item_substitutions
     set is_active = false, deactivated_at = now()
   where bill_item_id = p_item_id and is_active
  returning * into v_old;

  insert into stock_request.item_substitutions
    (bill_item_id, product_name, product_code, photo_path, ship_qty, reason, created_by)
  values
    (p_item_id, v_name, v_code, p_photo_path, p_ship_qty, v_reason, v_admin.id)
  returning * into v_sub;

  v_version := stock_request.record_hq_change(
    v_bill.id, v_admin, p_item_id, 'substitution_set',
    case when v_old.id is null then null else to_jsonb(v_old) end,
    to_jsonb(v_sub), v_reason);
  return jsonb_build_object('version', v_version, 'substitution_id', v_sub.id);
end;
$$;

create or replace function stock_request.hq_clear_substitution(
  p_admin_id          uuid,
  p_item_id           uuid,
  p_expected_version  integer,
  p_reason            text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin    stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill_id  uuid;
  v_bill     stock_request.bills;
  v_old      stock_request.item_substitutions;
  v_version  integer;
begin
  select bill_id into v_bill_id from stock_request.bill_items where id = p_item_id;
  if v_bill_id is null then
    perform stock_request.fail('SR_ITEM_NOT_FOUND', 'ไม่พบรายการสินค้า');
  end if;
  v_bill := stock_request.lock_bill(v_bill_id);
  perform stock_request.check_version(v_bill, p_expected_version);

  update stock_request.item_substitutions
     set is_active = false, deactivated_at = now()
   where bill_item_id = p_item_id and is_active
  returning * into v_old;

  if v_old.id is null then
    return jsonb_build_object('version', v_bill.version, 'changed', false);
  end if;

  v_version := stock_request.record_hq_change(
    v_bill.id, v_admin, p_item_id, 'substitution_remove', to_jsonb(v_old), null, p_reason);
  return jsonb_build_object('version', v_version, 'changed', true);
end;
$$;

-- ตัดบิล: ล็อก → ตรวจสถานะ/เวอร์ชัน → snapshot → billed → เปิดบิลใหม่ (ทั้งหมดใน transaction เดียว)
create or replace function stock_request.cut_bill(p_admin_id uuid, p_bill_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill   stock_request.bills;
  v_new    stock_request.bills;
  v_items  integer;
begin
  v_bill := stock_request.lock_bill(p_bill_id);
  if v_bill.status <> 'pending' then
    perform stock_request.fail('SR_ALREADY_BILLED', 'บิลนี้ถูกตัดไปแล้ว');
  end if;
  perform stock_request.check_version(v_bill, p_expected_version);

  select count(*) into v_items from stock_request.bill_items where bill_id = v_bill.id and not is_removed;
  if v_items = 0 then
    perform stock_request.fail('SR_EMPTY_BILL', 'บิลนี้ยังไม่มีรายการสินค้า');
  end if;

  update stock_request.bills
     set status = 'billed', billed_at = now(), billed_by = v_admin.id, version = version + 1
   where id = v_bill.id
  returning * into v_bill;

  insert into stock_request.bill_snapshots (bill_id, data, taken_by)
  values (v_bill.id, stock_request.bill_snapshot_json(v_bill.id), v_admin.id);

  insert into stock_request.status_logs (bill_id, from_status, to_status, admin_id, actor_name)
  values (v_bill.id, 'pending', 'billed', v_admin.id, v_admin.display_name);

  insert into stock_request.audit_logs (bill_id, admin_id, admin_name, action, after_data)
  values (v_bill.id, v_admin.id, v_admin.display_name, 'bill_cut', jsonb_build_object('item_count', v_items));

  -- แจ้งเตือน "รายการใหม่" ของบิลนี้ถือว่าจัดการแล้ว
  delete from stock_request.notifications
   where bill_id = v_bill.id and audience = 'hq' and type = 'new_items';

  perform stock_request.notify_branch(v_bill, 'bill_cut', 'สำนักงานใหญ่ตัดบิลแล้ว',
    format('บิล %s (%s รายการ) โดย %s', v_bill.bill_no, v_items, v_admin.display_name));

  v_new := stock_request.get_or_open_bill(v_bill.branch_id);

  return jsonb_build_object(
    'bill_id', v_bill.id, 'bill_no', v_bill.bill_no, 'version', v_bill.version,
    'new_bill_id', v_new.id, 'new_bill_no', v_new.bill_no);
end;
$$;

create or replace function stock_request.mark_shipped(p_admin_id uuid, p_bill_id uuid, p_expected_version integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin  stock_request.admin_profiles := stock_request.require_admin(p_admin_id);
  v_bill   stock_request.bills;
begin
  v_bill := stock_request.lock_bill(p_bill_id);
  if v_bill.status <> 'billed' then
    perform stock_request.fail('SR_INVALID_STATUS', 'เปลี่ยนเป็นจัดส่งได้เฉพาะบิลที่ตัดแล้ว');
  end if;
  perform stock_request.check_version(v_bill, p_expected_version);

  update stock_request.bills
     set status = 'shipped', shipped_at = now(), shipped_by = v_admin.id, version = version + 1
   where id = v_bill.id
  returning * into v_bill;

  insert into stock_request.status_logs (bill_id, from_status, to_status, admin_id, actor_name)
  values (v_bill.id, 'billed', 'shipped', v_admin.id, v_admin.display_name);

  insert into stock_request.audit_logs (bill_id, admin_id, admin_name, action, before_data, after_data)
  values (v_bill.id, v_admin.id, v_admin.display_name, 'status_change',
          jsonb_build_object('status', 'billed'), jsonb_build_object('status', 'shipped'));

  perform stock_request.notify_branch(v_bill, 'shipped', 'สำนักงานใหญ่จัดส่งสินค้าแล้ว',
    format('บิล %s จัดส่งแล้ว กรุณายืนยันเมื่อได้รับสินค้า', v_bill.bill_no));

  return jsonb_build_object('bill_id', v_bill.id, 'status', v_bill.status, 'version', v_bill.version);
end;
$$;

-- ---------------------------------------------------------------------
-- Storage bucket (private)
-- ---------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('stock-request-photos', 'stock-request-photos', false, 5242880,
        array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- ---------------------------------------------------------------------
-- Row Level Security + สิทธิ์
-- ---------------------------------------------------------------------
alter table stock_request.admin_profiles        enable row level security;
alter table stock_request.bill_counters         enable row level security;
alter table stock_request.bills                 enable row level security;
alter table stock_request.bill_items            enable row level security;
alter table stock_request.item_substitutions    enable row level security;
alter table stock_request.bill_snapshots        enable row level security;
alter table stock_request.audit_logs            enable row level security;
alter table stock_request.status_logs           enable row level security;
alter table stock_request.notifications         enable row level security;
alter table stock_request.notification_reads    enable row level security;
alter table stock_request.storage_cleanup_queue enable row level security;
alter table stock_request.branch_members        enable row level security;

-- anon: ไม่มีสิทธิ์ใด ๆ / authenticated: อ่านได้ตาม policy / เขียนผ่าน function เท่านั้น
revoke all on all tables in schema stock_request from public, anon, authenticated;
grant select on all tables in schema stock_request to authenticated;
grant all on all tables in schema stock_request to service_role;

revoke execute on all functions in schema stock_request from public, anon, authenticated;
grant execute on all functions in schema stock_request to service_role;
grant execute on function stock_request.is_admin() to authenticated;

create policy admin_profiles_read on stock_request.admin_profiles
  for select to authenticated using (id = (select auth.uid()) or (select stock_request.is_admin()));

create policy bills_admin_read on stock_request.bills
  for select to authenticated using ((select stock_request.is_admin()));
create policy bill_items_admin_read on stock_request.bill_items
  for select to authenticated using ((select stock_request.is_admin()));
create policy item_substitutions_admin_read on stock_request.item_substitutions
  for select to authenticated using ((select stock_request.is_admin()));
create policy bill_snapshots_admin_read on stock_request.bill_snapshots
  for select to authenticated using ((select stock_request.is_admin()));
create policy audit_logs_admin_read on stock_request.audit_logs
  for select to authenticated using ((select stock_request.is_admin()));
create policy status_logs_admin_read on stock_request.status_logs
  for select to authenticated using ((select stock_request.is_admin()));
create policy notifications_admin_read on stock_request.notifications
  for select to authenticated using (audience = 'hq' and (select stock_request.is_admin()));
create policy notification_reads_own on stock_request.notification_reads
  for select to authenticated using (admin_id = (select auth.uid()));
create policy branch_members_own on stock_request.branch_members
  for select to authenticated using (user_id = (select auth.uid()));
-- bill_counters, storage_cleanup_queue: ไม่มี policy → เข้าได้เฉพาะ service_role
