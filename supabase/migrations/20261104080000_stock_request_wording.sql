-- ปรับคำในแจ้งเตือนฝั่งสำนักงานใหญ่: ระบบนี้คือ "แจ้งสินค้าใกล้หมด" ไม่ใช่ "เบิก"
-- แก้ข้อความในฟังก์ชัน add_branch_item ที่ใช้อยู่จริง (อ่านนิยามปัจจุบันแล้วแทนที่เฉพาะข้อความ)
do $$
declare
  v_def text;
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'stock_request' and p.proname = 'add_branch_item';
  if v_def is null then
    raise exception 'ไม่พบฟังก์ชัน stock_request.add_branch_item';
  end if;
  execute replace(v_def, 'มีรายการเบิกใหม่', 'มีรายการแจ้งสินค้าใหม่');
end $$;

update stock_request.notifications set title = 'มีรายการแจ้งสินค้าใหม่' where type = 'new_items' and title = 'มีรายการเบิกใหม่';

notify pgrst, 'reload schema';
