-- ลิงก์หยิบของ: แอดมินส่งลิงก์ของบิลเดียวให้คนเดินหยิบของ (ไม่ต้องใช้รหัสแอดมิน)
-- เก็บเฉพาะ hash ของรหัสลิงก์ · ใช้ได้จนบิลถูกจัดส่ง หรือหมดอายุ / ถูกยกเลิก
create table if not exists stock_request.pick_links (
  id              uuid primary key default gen_random_uuid(),
  bill_id         uuid not null references stock_request.bills(id) on delete cascade,
  token_hash      text not null unique,
  created_at      timestamptz not null default now(),
  expires_at      timestamptz not null,
  revoked_at      timestamptz,
  last_saved_at   timestamptz,
  last_saved_by   text
);
create index if not exists pick_links_bill_idx on stock_request.pick_links (bill_id);

alter table stock_request.pick_links enable row level security;
revoke all on stock_request.pick_links from public, anon, authenticated;
grant all on stock_request.pick_links to service_role;

notify pgrst, 'reload schema';
