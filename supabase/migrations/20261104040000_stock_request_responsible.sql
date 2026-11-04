-- =====================================================================
-- Stock Request: ผู้รับผิดชอบบิล — กรอกตอนตัดบิล (ผู้ดูแลใช้รหัสกลางร่วมกัน จึงต้องระบุชื่อคนจริง)
-- แสดงให้สาขาเห็นในไทม์ไลน์ และในหน้าบิล/PDF/ใบจัดสินค้า
-- =====================================================================

alter table stock_request.bills
  add column if not exists responsible_name text
    check (responsible_name is null or char_length(btrim(responsible_name)) between 1 and 100);

comment on column stock_request.bills.responsible_name is 'ชื่อผู้รับผิดชอบบิล (ระบุตอนตัดบิล)';

notify pgrst, 'reload schema';
