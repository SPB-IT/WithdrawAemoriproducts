'use client';

import ExcelJS from 'exceljs';
import { saveAs } from 'file-saver';
import { AUDIT_ACTION_LABEL, FIELD_LABEL, STATUS_LABEL } from './constants';
import { sentQty } from './qty';
import type { BillDetail, JsonObject } from './types';

const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEDE9FE' } };

function thaiDateTime(value: string | null | undefined) {
  if (!value) return '';
  return new Intl.DateTimeFormat('th-TH', {
    timeZone: 'Asia/Bangkok',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function addSheet(workbook: ExcelJS.Workbook, name: string, columns: { header: string; key: string; width: number }[], rows: Record<string, unknown>[]) {
  const sheet = workbook.addWorksheet(name, { views: [{ state: 'frozen', ySplit: 1 }] });
  sheet.columns = columns;
  const header = sheet.getRow(1);
  header.font = { bold: true, color: { argb: 'FF4C1D95' } };
  header.fill = HEADER_FILL;
  header.alignment = { vertical: 'middle' };
  header.height = 22;
  rows.forEach((row) => sheet.addRow(row));
  sheet.eachRow((row, index) => {
    row.eachCell((cell) => {
      cell.border = { top: { style: 'thin', color: { argb: 'FFE2E8F0' } }, bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } } };
      if (index > 1) cell.alignment = { vertical: 'top', wrapText: true };
    });
  });
  sheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };
  return sheet;
}

function describe(data: JsonObject | null) {
  if (!data) return '';
  return Object.entries(data)
    .filter(([key]) => key in FIELD_LABEL || ['product_name', 'product_code'].includes(key))
    .map(([key, value]) => `${FIELD_LABEL[key] ?? key}: ${value ?? '-'}`)
    .join('\n');
}

/**
 * ส่งออก Excel 1 ไฟล์ 4 ชีต: รายการสินค้า, ประวัติบิล, รายงานการแก้ไข, รายงานสินค้าทดแทน
 * ใช้ได้ทั้งบิลเดียว (หน้ารายละเอียด) และหลายบิล/ทุกสาขา (หน้ารวมบิล)
 */
export async function exportBillsExcel(bills: BillDetail[], filename: string) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Aemori Stock Request';
  workbook.created = new Date();

  addSheet(
    workbook,
    'รายการสินค้า',
    [
      { header: 'เลขที่บิล', key: 'bill_no', width: 20 },
      { header: 'สาขา', key: 'branch', width: 24 },
      { header: 'สถานะบิล', key: 'status', width: 14 },
      { header: 'วันที่สร้างบิล', key: 'created', width: 18 },
      { header: 'ชื่อสินค้า', key: 'name', width: 32 },
      { header: 'รหัสสินค้า', key: 'code', width: 16 },
      { header: 'จำนวนที่สั่ง', key: 'stock', width: 14 },
      { header: 'จำนวนที่ส่งจริง', key: 'sent', width: 14 },
      { header: 'สินค้าทดแทน', key: 'sub_name', width: 28 },
      { header: 'รหัสทดแทน', key: 'sub_code', width: 16 },
      { header: 'เหตุผลทดแทน', key: 'sub_reason', width: 28 },
      { header: 'หมายเหตุสาขา', key: 'staff_note', width: 28 },
      { header: 'หมายเหตุ HQ', key: 'hq_note', width: 28 },
      { header: 'ผู้ลงรายการ', key: 'reporter', width: 18 },
      { header: 'เวลาลงรายการ', key: 'item_created', width: 18 },
      { header: 'สถานะรายการ', key: 'item_state', width: 12 },
    ],
    bills.flatMap((bill) =>
      bill.items.map((item) => ({
        bill_no: bill.bill_no,
        branch: bill.branch_name,
        status: STATUS_LABEL[bill.status],
        created: thaiDateTime(bill.created_at),
        name: item.product_name,
        code: item.product_code,
        stock: item.stock_on_hand,
        sent: item.is_removed ? 0 : sentQty(item),
        sub_name: item.substitution?.product_name ?? '',
        sub_code: item.substitution?.product_code ?? '',
        sub_reason: item.substitution?.reason ?? '',
        staff_note: item.staff_note ?? '',
        hq_note: item.hq_note ?? '',
        reporter: item.reported_by_name,
        item_created: thaiDateTime(item.created_at),
        item_state: item.is_removed ? 'ถูกนำออก' : 'ใช้งาน',
      })),
    ),
  );

  addSheet(
    workbook,
    'ประวัติบิล',
    [
      { header: 'เลขที่บิล', key: 'bill_no', width: 20 },
      { header: 'สาขา', key: 'branch', width: 24 },
      { header: 'สถานะ', key: 'status', width: 14 },
      { header: 'จำนวนรายการ', key: 'count', width: 12 },
      { header: 'สร้างเมื่อ', key: 'created', width: 18 },
      { header: 'ตัดบิลเมื่อ', key: 'billed_at', width: 18 },
      { header: 'ผู้รับผิดชอบ (ตัดบิล)', key: 'billed_by', width: 18 },
      { header: 'จัดส่งเมื่อ', key: 'shipped_at', width: 18 },
      { header: 'ผู้จัดส่ง', key: 'shipped_by', width: 18 },
      { header: 'ได้รับเมื่อ', key: 'received_at', width: 18 },
      { header: 'ผู้ยืนยันรับ', key: 'received_by', width: 18 },
    ],
    bills.map((bill) => ({
      bill_no: bill.bill_no,
      branch: bill.branch_name,
      status: STATUS_LABEL[bill.status],
      count: bill.items.filter((item) => !item.is_removed).length,
      created: thaiDateTime(bill.created_at),
      billed_at: thaiDateTime(bill.billed_at),
      billed_by: bill.billed_by_name ?? '',
      shipped_at: thaiDateTime(bill.shipped_at),
      shipped_by: bill.shipped_by_name ?? '',
      received_at: thaiDateTime(bill.received_at),
      received_by: bill.received_by_name ?? '',
    })),
  );

  addSheet(
    workbook,
    'รายงานการแก้ไข',
    [
      { header: 'วันเวลา', key: 'at', width: 18 },
      { header: 'เลขที่บิล', key: 'bill_no', width: 20 },
      { header: 'สาขา', key: 'branch', width: 24 },
      { header: 'ผู้แก้ไข', key: 'admin', width: 18 },
      { header: 'ประเภท', key: 'action', width: 20 },
      { header: 'สินค้า', key: 'item', width: 28 },
      { header: 'ข้อมูลก่อนแก้ไข', key: 'before', width: 30 },
      { header: 'ข้อมูลหลังแก้ไข', key: 'after', width: 30 },
      { header: 'เหตุผล', key: 'reason', width: 30 },
      { header: 'แก้หลังตัดบิล', key: 'after_billing', width: 12 },
    ],
    bills.flatMap((bill) => {
      const names = new Map(bill.items.map((item) => [item.id, `${item.product_name} (${item.product_code})`]));
      return bill.audit_logs.map((log) => ({
        at: thaiDateTime(log.created_at),
        bill_no: bill.bill_no,
        branch: bill.branch_name,
        admin: log.admin_name,
        action: AUDIT_ACTION_LABEL[log.action],
        item: log.bill_item_id ? names.get(log.bill_item_id) ?? '' : '',
        before: describe(log.before_data),
        after: describe(log.after_data),
        reason: log.reason ?? '',
        after_billing: log.after_billing ? 'ใช่' : '',
      }));
    }),
  );

  addSheet(
    workbook,
    'รายงานสินค้าทดแทน',
    [
      { header: 'เลขที่บิล', key: 'bill_no', width: 20 },
      { header: 'สาขา', key: 'branch', width: 24 },
      { header: 'สินค้าเดิม', key: 'original', width: 28 },
      { header: 'รหัสเดิม', key: 'original_code', width: 16 },
      { header: 'จำนวนที่สาขาสั่ง', key: 'stock', width: 14 },
      { header: 'สินค้าทดแทน', key: 'sub', width: 28 },
      { header: 'รหัสทดแทน', key: 'sub_code', width: 16 },
      { header: 'เหตุผล', key: 'reason', width: 30 },
      { header: 'ผู้กำหนด', key: 'by', width: 18 },
      { header: 'เมื่อ', key: 'at', width: 18 },
      { header: 'สถานะ', key: 'active', width: 14 },
    ],
    bills.flatMap((bill) =>
      bill.items.flatMap((item) =>
        item.substitution_history.map((sub) => ({
          bill_no: bill.bill_no,
          branch: bill.branch_name,
          original: item.product_name,
          original_code: item.product_code,
          stock: item.stock_on_hand,
          sub: sub.product_name,
          sub_code: sub.product_code,
          reason: sub.reason,
          by: sub.created_by_name ?? '',
          at: thaiDateTime(sub.created_at),
          active: sub.is_active ? 'ใช้งานอยู่' : 'ถูกแทนที่/ยกเลิก',
        })),
      ),
    ),
  );

  const buffer = await workbook.xlsx.writeBuffer();
  saveAs(new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), `${filename}.xlsx`);
}
