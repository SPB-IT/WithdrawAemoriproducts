# ระบบแจ้งสินค้าใกล้หมด (Stock Request) — คู่มือติดตั้ง ใช้งาน และ Deploy

ระบบนี้อยู่ในโปรเจกต์เดียวกับ "ระบบเบิกสินค้า Aemori" และใช้ Supabase project เดียวกัน แต่ข้อมูลแยกอยู่ใน schema `stock_request`
ดูรายละเอียดการออกแบบที่ [`01-design.md`](./01-design.md)

| ส่วน | URL |
|---|---|
| หน้าหลัก (เลือกระบบ) | `/` |
| สาขา: เลือกสาขา → ระบุชื่อ → บิลปัจจุบัน / ประวัติ | `/stock-request` |
| ผู้ดูแล: เข้าสู่โหมดผู้ดูแลเดิม → เลือกระบบ | `/admin/access` → `/admin` |
| สำนักงานใหญ่ ระบบแจ้งสินค้าใกล้หมด | `/admin/stock-request` |

---

## 1. ตั้งค่าฐานข้อมูล (ทำครั้งเดียว)

1. Supabase → **SQL Editor** → รัน `supabase/migrations/20261103000000_stock_request_init.sql` แล้วตามด้วย `20261103010000_stock_request_shared_admin.sql`
2. รัน `supabase/tests/stock_request_smoke_test.sql` → ต้องไม่มี error (สคริปต์ rollback เอง ไม่มีข้อมูลค้าง)
3. **Project Settings → Data API → Exposed schemas** → เพิ่ม `stock_request` → Save
4. Storage bucket `stock-request-photos` (private, 5MB, jpg/png/webp) ถูกสร้างโดย migration แล้ว

## 2. ผู้ดูแล (HQ)

ใช้ **การเข้าสู่โหมดผู้ดูแลเดิม** (`/admin/access` + รหัสกลาง `ADMIN_ACCESS_PASSWORD`) — ไม่ต้องสร้างบัญชี Supabase Auth

1. เข้า `/admin` → ใส่รหัสกลาง → หน้า **เลือกระบบ**: ระบบเบิกสินค้า Aemori / ระบบแจ้งสินค้าใกล้หมด
2. เข้าใช้งานได้ทันที ไม่ต้องเลือกชื่อ (เหมือนระบบเดิม) — ผู้ตัดบิล ผู้จัดส่ง และผู้แก้ไขใน Audit Log
   ถูกบันทึกในนามโปรไฟล์กลาง **"ผู้ดูแลระบบ"** (สร้างใน `admin_profiles` อัตโนมัติครั้งแรก)

> ต้องรัน migration `20261103010000_stock_request_shared_admin.sql` ด้วย (ปลดการผูก admin_profiles กับ Supabase Auth)

## 3. Environment Variables

คัดลอก `.env.example` → `.env.local` แล้วใส่ค่า (ค่าเดิม 4 ตัวมีอยู่แล้ว) เพิ่มเพียง:

```
SUPABASE_SERVICE_ROLE_KEY=...   # Project Settings → API → service_role (secret)
```

> ⚠️ key นี้ข้ามสิทธิ์ RLS ทั้งหมด — ใช้เฉพาะฝั่ง server ห้ามตั้งชื่อขึ้นต้น `NEXT_PUBLIC_` และห้าม commit

## 4. รันบนเครื่อง

```bash
npm install
npm run dev
```

## 5. Deploy บน Vercel

1. commit + push ขึ้น GitHub (ไฟล์ `.env*` ถูก ignore อยู่แล้ว)
2. Vercel → Project → **Settings → Environment Variables** → เพิ่ม `SUPABASE_SERVICE_ROLE_KEY` (Production + Preview)
3. Redeploy → ทดสอบตามข้อ 6 บน production

## 6. ทดสอบหลัง deploy

1. `/stock-request` → เลือกสาขา → ใส่ชื่อ → เพิ่มสินค้า (ถ่ายรูป/เลือกรูป) → เห็นในบิล
2. `/admin` → ใส่รหัสกลาง → เลือก "ระบบแจ้งสินค้าใกล้หมด" → แดชบอร์ดเห็นสาขาที่มีรายการ → เปิดบิล → ใส่จำนวนจัดส่ง / สินค้าทดแทน
3. ตรวจและตัดบิล → สาขาได้บิลใหม่อัตโนมัติ → พิมพ์ใบจัดสินค้า A4 / Excel / PDF
4. HQ กด "ยืนยันจัดส่งแล้ว" → สาขาไปที่ "ติดตามสถานะ" → กดยืนยันรับสินค้า

---

## การทำงานสำคัญ

- **1 สาขา = 1 บิลเปิด** (บังคับที่ฐานข้อมูล) รายการบันทึกทันที สาขาแก้/ลบเองไม่ได้
- **ตัดบิล** ทำใน transaction เดียว: ล็อกบิล → กันตัดซ้ำ → snapshot → เปิดบิลใหม่
- **กันแก้พร้อมกัน**: ทุกการแก้ส่งเลขเวอร์ชันบิล ถ้ามีคนแก้ก่อน/สาขาเพิ่มรายการระหว่างตรวจ ระบบจะให้โหลดใหม่
- **แก้หลังตัดบิล** ต้องมีเหตุผล บันทึก Audit Log (ก่อน/หลัง/ใคร/เมื่อไร) และแจ้งสาขา
- **ประวัติ 3 บิล**: เมื่อสาขายืนยันรับ บิลที่ "ได้รับแล้ว" และเก่ากว่า 3 บิลล่าสุดจะถูกลบพร้อมรูป (บิลที่ยังไม่ถึงสาขาไม่ถูกลบ)
- **แจ้งเตือน** ในเว็บ (กระดิ่ง) อัปเดตทุก 30 วินาที

## โครงสร้างไฟล์

```
app/page.tsx                          หน้าหลักเลือกระบบ
app/stock-request/                    หน้าสาขา
app/api/stock-request/                API ฝั่งสาขา
components/stock-request/             UI components (กล้อง, กระดิ่ง, PDF, ...)
lib/stock-request/                    supabase clients, auth, queries, validation, export
app/admin/page.tsx                    หน้าเลือกระบบหลังเข้าสู่โหมดผู้ดูแล
app/admin/stock-request/              หน้า HQ + api/ (ป้องกันด้วยรหัสกลางเดิมผ่าน proxy.ts)
proxy.ts                              /admin/* ใช้รหัสกลางเดิม (API ตอบ 401 JSON)
supabase/migrations/…stock_request_init.sql
supabase/tests/stock_request_smoke_test.sql
```

## ข้อจำกัดเวอร์ชันนี้

- ฝั่งสาขาไม่มี PIN ตามสเปก — ใครมีลิงก์เลือกสาขาใดก็ได้ (โครงสร้าง `branch_members` เตรียมไว้สำหรับ login สาขาในอนาคต)
- ส่งออก Excel/PDF จากหน้ารวมบิลได้สูงสุด 300 บิลต่อครั้ง (รูปใน PDF แสดงเฉพาะการส่งออกจากหน้าบิล)

## ไฟล์ที่เลิกใช้ (ลบได้)

โฟลเดอร์ต่อไปนี้เหลือไว้เป็นตัว redirect / ตอบ 410 เท่านั้น ลบทิ้งได้ทั้งโฟลเดอร์:

- `app/stock-request/hq/`
- `app/api/stock-request/hq/`
- `lib/stock-request/supabase-server.ts`, `lib/stock-request/supabase-browser.ts`
