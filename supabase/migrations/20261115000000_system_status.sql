-- สวิตช์ปิด/เปิดระบบจากหลังบ้าน (ใช้ปิดระบบชั่วคราวไม่ให้พนักงานสาขาใช้)
-- ถ้าไม่มีแถว หรือตารางยังไม่ถูกสร้าง ระบบถือว่า "เปิดอยู่" เสมอ
create table if not exists public.system_status (
  system     text primary key check (system in ('requisition', 'stock-request')),
  closed     boolean not null default false,
  message    text,
  updated_at timestamptz not null default now()
);

insert into public.system_status (system, closed)
values ('requisition', false), ('stock-request', false)
on conflict (system) do nothing;

alter table public.system_status enable row level security;
revoke all on public.system_status from anon, authenticated;
grant all on public.system_status to service_role;
