-- =====================================================================
-- Stock Request: สาขาเช็คของที่ได้รับทีละรายการ (หลัง HQ จัดส่ง)
-- received_state: null = ยังไม่เช็ค · 'ok' = ได้รับครบ · 'missing' = ไม่ได้รับ/ไม่ครบ (ต้องมีหมายเหตุ)
-- เขียนผ่าน API ฝั่ง server (service role) เท่านั้น
-- =====================================================================

alter table stock_request.bill_items
  add column if not exists received_state text,
  add column if not exists received_note text,
  add column if not exists received_checked_by text,
  add column if not exists received_checked_at timestamptz;

alter table stock_request.bill_items drop constraint if exists bill_items_received_state_check;
alter table stock_request.bill_items add constraint bill_items_received_state_check check (
  received_state is null
  or received_state = 'ok'
  or (received_state = 'missing' and received_note is not null and char_length(btrim(received_note)) > 0)
);

comment on column stock_request.bill_items.received_state is 'ผลเช็คของฝั่งสาขา: null=ยังไม่เช็ค, ok=ได้รับ, missing=ไม่ได้รับ/ไม่ครบ';

notify pgrst, 'reload schema';
