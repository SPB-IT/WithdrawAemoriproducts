-- ชื่อผู้จัดส่ง (กรอกตอนยืนยันจัดส่ง) — บัญชีผู้ดูแลเป็นบัญชีรวม จึงต้องเก็บชื่อคนแยก
alter table stock_request.bills add column if not exists shipped_name text check (shipped_name is null or char_length(shipped_name) between 1 and 100);
