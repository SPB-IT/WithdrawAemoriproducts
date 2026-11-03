-- =====================================================================
-- Stock Request: ใช้ระบบเข้าสู่โหมดผู้ดูแลเดิม (/admin/access รหัสกลาง)
-- ผู้ดูแลแต่ละคนยังมี admin_profiles ของตัวเอง (เลือกชื่อหลังเข้าสู่ระบบ)
-- เพื่อให้ audit log / ผู้ตัดบิล / ผู้จัดส่ง ยังระบุตัวบุคคลได้
-- ไม่ต้องสร้างบัญชีใน Supabase Auth อีกต่อไป
-- =====================================================================

alter table stock_request.admin_profiles
  drop constraint if exists admin_profiles_id_fkey;

alter table stock_request.admin_profiles
  alter column id set default gen_random_uuid();

-- ชื่อผู้ดูแลห้ามซ้ำ (ไม่สนตัวพิมพ์เล็กใหญ่/ช่องว่างหัวท้าย)
create unique index if not exists admin_profiles_display_name_unique
  on stock_request.admin_profiles (lower(btrim(display_name)));

comment on table stock_request.admin_profiles is
  'รายชื่อผู้ดูแล HQ — เข้าสู่ระบบด้วยรหัสกลางของ /admin แล้วเลือกชื่อตัวเอง; ปิดใช้งานด้วย is_active แทนการลบ';
