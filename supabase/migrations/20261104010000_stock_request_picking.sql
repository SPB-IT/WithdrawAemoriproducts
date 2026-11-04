-- =====================================================================
-- Stock Request: หน้าเช็คของ (หลังตัดบิล) — บันทึกว่ารายการไหนจัดเตรียมแล้ว
-- เขียนผ่าน API หลังบ้านด้วย service role เท่านั้น (anon/authenticated ไม่มีสิทธิ์เขียนตารางนี้)
-- =====================================================================

alter table stock_request.bill_items
  add column if not exists picked_at timestamptz,
  add column if not exists picked_by text;

comment on column stock_request.bill_items.picked_at is 'เวลาที่ติ๊กว่าจัดเตรียมสินค้าแล้ว (หน้าเช็คของ) — null = ยังไม่ได้จัด';
comment on column stock_request.bill_items.picked_by is 'ผู้ติ๊กจัดเตรียมสินค้า';

notify pgrst, 'reload schema';
