-- หมายเหตุของรายการที่ผู้ดูแลเพิ่มเอง หรือที่ทดแทนสินค้าเดิม ตอนอนุมัติใบเบิก
-- เช่น "เพิ่มโดยผู้ดูแล" / "ทดแทน สติ๊กเกอร์ XXX" (รายการที่สาขาขอมาเองจะเป็น null)
alter table public.requisition_details add column if not exists admin_note text;
