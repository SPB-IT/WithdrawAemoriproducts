'use client';
/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> has no alt prop */

import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { saveAs } from 'file-saver';
import { openPdfBlob } from '@/lib/open-pdf';
import { STATUS_LABEL } from '@/lib/stock-request/constants';
import type { BillDetail } from '@/lib/stock-request/types';
import { isPartial, sentQty } from '@/lib/stock-request/qty';
import { removalLog } from './BillParts';

// จำนวนในเอกสาร: ปกติ = จำนวนที่สั่ง · ของไม่พอ = ส่งได้/สั่ง
const qtyText = (item: BillDetail['items'][number]) => (isPartial(item) ? `${sentQty(item)}/${item.stock_on_hand}` : String(item.stock_on_hand ?? '-'));

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
  ],
});
// ภาษาไทยไม่มีช่องว่างระหว่างคำ — แบ่งคำด้วย Intl.Segmenter แล้วคั่นด้วย '' เพื่อให้ตัดบรรทัดได้โดยไม่ใส่ขีด
const thaiSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
Font.registerHyphenationCallback((word) => {
  if (!thaiSegmenter || !/[\u0E00-\u0E7F]/.test(word)) return [word];
  return Array.from(thaiSegmenter.segment(word), (part) => part.segment).flatMap((part) => [part, '']);
});

const styles = StyleSheet.create({
  page: { padding: 28, fontFamily: 'THSarabunNew', fontSize: 13, color: '#1e293b' },
  header: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10, borderBottom: '1.5px solid #ec4899', paddingBottom: 8 },
  title: { fontSize: 20, fontWeight: 'bold' },
  muted: { color: '#64748b', fontSize: 12 },
  row: { flexDirection: 'row', borderBottom: '0.5px solid #e2e8f0', paddingVertical: 4, alignItems: 'center' },
  th: { flexDirection: 'row', backgroundColor: '#fce7f3', paddingVertical: 4, fontWeight: 'bold' },
  photo: { width: 46, height: 46, objectFit: 'cover', borderRadius: 4 },
  cellNo: { width: 22, textAlign: 'center' },
  cellPhoto: { width: 54 },
  cellName: { flex: 1, paddingRight: 4 },
  cellNum: { width: 52, textAlign: 'center' },
  cellNote: { width: 120, paddingRight: 2 },
  cellReceive: { width: 110, paddingLeft: 4 },
  sub: { color: '#be185d', fontSize: 12 },
  box: { width: 12, height: 12, border: '1.2px solid #1e293b', marginHorizontal: 'auto' },
  cellCheck: { width: 24 },
  cellCode: { width: 78, paddingRight: 2 },
  logo: { width: 40, height: 40, borderRadius: 6, marginRight: 8 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 28 },
  signBox: { width: '45%', textAlign: 'center' },
});

const fmt = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
    : '-';

/** ผลเช็คของฝั่งสาขา (แสดงเมื่อจัดส่งแล้ว) */
const receivedText = (item: BillDetail['items'][number]) =>
  item.received_state === 'ok' ? 'ได้รับ' : item.received_state === 'missing' ? `ไม่ได้รับ/ไม่ครบ: ${item.received_note ?? '-'}` : 'ยังไม่เช็ค';

function BillPages({ bill }: { bill: BillDetail }) {
  const items = bill.items.filter((item) => !item.is_removed);
  const removed = bill.items.filter((item) => item.is_removed);
  // หลัง HQ จัดส่ง แสดงคอลัมน์ผลเช็คของของสาขา (ใช้เป็นหลักฐานกรณีได้ของไม่ครบ)
  const showReceive = bill.status === 'shipped' || bill.status === 'received';
  const missingCount = items.filter((item) => item.received_state === 'missing').length;
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View>
          <Text style={styles.title}>ใบรายการแจ้งสินค้าใกล้หมด</Text>
          <Text style={styles.muted}>Aemori</Text>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontWeight: 'bold', fontSize: 15 }}>{bill.bill_no}</Text>
          <Text>{bill.branch_name}</Text>
          <Text style={styles.muted}>สถานะ: {STATUS_LABEL[bill.status]}</Text>
        </View>
      </View>
      <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
        <Text style={styles.muted}>สร้างบิล: {fmt(bill.created_at)}</Text>
        <Text style={styles.muted}>
          ตัดบิล: {fmt(bill.billed_at)} {bill.responsible_name ? `· ผู้รับผิดชอบ ${bill.responsible_name}` : bill.billed_by_name ? `โดย ${bill.billed_by_name}` : ''}
        </Text>
      </View>
      {showReceive && (
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 }}>
          <Text style={styles.muted}>จัดส่ง: {fmt(bill.shipped_at)}</Text>
          <Text style={styles.muted}>
            สาขารับ: {fmt(bill.received_at)} {bill.received_by_name ? `โดย ${bill.received_by_name}` : ''}
          </Text>
        </View>
      )}
      {showReceive && missingCount > 0 && (
        <Text style={{ marginBottom: 8, color: '#be123c', fontWeight: 'bold' }}>*** สาขาแจ้งว่าได้รับไม่ครบ {missingCount} รายการ</Text>
      )}

      <View style={styles.th} fixed>
        <Text style={styles.cellNo}>#</Text>
        <Text style={styles.cellPhoto}>รูป</Text>
        <Text style={styles.cellName}>สินค้า / รหัส</Text>
        <Text style={styles.cellNum}>สั่ง</Text>
        <Text style={styles.cellNote}>หมายเหตุ</Text>
        {showReceive && <Text style={styles.cellReceive}>ผลรับของ (สาขา)</Text>}
      </View>
      {items.map((item, index) => (
        <View key={item.id} style={styles.row} wrap={false}>
          <Text style={styles.cellNo}>{index + 1}</Text>
          <View style={styles.cellPhoto}>{item.photo_url ? <Image src={item.photo_url} style={styles.photo} /> : <Text style={styles.muted}>-</Text>}</View>
          <View style={styles.cellName}>
            <Text style={{ fontWeight: 'bold' }}>{item.product_name}</Text>
            <Text style={styles.muted}>รหัส {item.product_code}</Text>
            {item.substitution && (
              <Text style={styles.sub}>
                ทดแทนด้วย: {item.substitution.product_name} ({item.substitution.product_code}) — {item.substitution.reason}
              </Text>
            )}
          </View>
          <Text style={styles.cellNum}>{qtyText(item)}</Text>
          <Text style={styles.cellNote}>{[item.staff_note, item.hq_note ? `HQ: ${item.hq_note}` : null].filter(Boolean).join(' / ') || '-'}</Text>
          {showReceive && (
            <Text style={[styles.cellReceive, item.received_state === 'missing' ? { color: '#be123c', fontWeight: 'bold' } : item.received_state === 'ok' ? { color: '#047857' } : { color: '#94a3b8' }]}>
              {receivedText(item)}
              {item.received_checked_by ? `
(${item.received_checked_by})` : ''}
            </Text>
          )}
        </View>
      ))}
      <Text style={{ marginTop: 6, textAlign: 'right' }}>รวม {items.length} รายการ</Text>
      {items.some(isPartial) && (
        <Text style={[styles.muted, { marginTop: 4 }]}>
          ของไม่พอ ส่งได้ไม่ครบ (ส่งได้/สั่ง): {items.filter(isPartial).map((item) => `${item.product_name} ${sentQty(item)}/${item.stock_on_hand}`).join(' · ')}
        </Text>
      )}
      {removed.length > 0 && (
        <Text style={[styles.muted, { marginTop: 4 }]}>
          รายการที่สำนักงานใหญ่ไม่ได้จัดส่ง: {removed.map((item) => `${item.product_name} (${item.product_code}) — ${removalLog(bill, item.id)?.reason || 'ไม่ได้ระบุเหตุผล'}`).join(' · ')}
        </Text>
      )}

      <View style={styles.signRow} wrap={false}>
        <View style={styles.signBox}>
          <Text>ลงชื่อ ........................................ ผู้จัดสินค้า</Text>
          <Text style={styles.muted}>วันที่ ......../......../........</Text>
        </View>
        <View style={styles.signBox}>
          <Text>ลงชื่อ ........................................ ผู้ตรวจสอบ</Text>
          <Text style={styles.muted}>วันที่ ......../......../........</Text>
        </View>
      </View>
      <Text style={[styles.muted, { position: 'absolute', bottom: 14, right: 28 }]} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} fixed />
    </Page>
  );
}

export async function exportBillsPdf(bills: BillDetail[], filename: string) {
  const blob = await pdf(
    <Document title={filename}>
      {bills.map((bill) => (
        <BillPages key={bill.id} bill={bill} />
      ))}
    </Document>,
  ).toBlob();
  saveAs(blob, `${filename}.pdf`);
}

/** ใบจัดสินค้า A4 (สำนักงานใหญ่) — เอกสาร PDF: ช่องติ๊กตรวจ รูป ชื่อ/รหัส จำนวนที่สาขาสั่ง หมายเหตุ ช่องลงชื่อ */
function PickingSheetPage({ bill }: { bill: BillDetail }) {
  const items = bill.items.filter((item) => !item.is_removed);
  return (
    <Page size="A4" style={styles.page}>
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Image src="/logo.png" style={styles.logo} />
          <View>
            <Text style={styles.title}>ใบจัดสินค้า</Text>
            <Text style={styles.muted}>ระบบแจ้งสินค้าใกล้หมด · Aemori</Text>
          </View>
        </View>
        <View style={{ alignItems: 'flex-end' }}>
          <Text style={{ fontWeight: 'bold', fontSize: 15 }}>{bill.bill_no}</Text>
          <Text>{bill.branch_name}</Text>
          <Text style={styles.muted}>สร้างบิล {fmt(bill.created_at)}</Text>
          <Text style={styles.muted}>ตัดบิล {fmt(bill.billed_at)}</Text>
          {bill.responsible_name && <Text style={{ fontWeight: 'bold' }}>ผู้รับผิดชอบ: {bill.responsible_name}</Text>}
        </View>
      </View>

      <View style={styles.th} fixed>
        <Text style={[styles.cellCheck, { textAlign: 'center' }]}>✓</Text>
        <Text style={styles.cellNo}>#</Text>
        <Text style={styles.cellPhoto}>รูป</Text>
        <Text style={styles.cellName}>ชื่อสินค้า</Text>
        <Text style={styles.cellCode}>รหัสสินค้า</Text>
        <Text style={styles.cellNum}>จำนวนที่สั่ง</Text>
        <Text style={styles.cellNote}>หมายเหตุ</Text>
      </View>
      {items.map((item, index) => {
        const sub = item.substitution;
        const photo = sub?.photo_url ?? item.photo_url;
        return (
          <View key={item.id} style={styles.row} wrap={false}>
            <View style={styles.cellCheck}>
              <View style={styles.box} />
            </View>
            <Text style={styles.cellNo}>{index + 1}</Text>
            <View style={styles.cellPhoto}>{photo ? <Image src={photo} style={styles.photo} /> : <Text style={styles.muted}>-</Text>}</View>
            <View style={styles.cellName}>
              <Text style={{ fontWeight: 'bold' }}>{sub ? sub.product_name : item.product_name}</Text>
              {sub && (
                <Text style={styles.sub}>
                  ทดแทน {item.product_name} ({item.product_code})
                </Text>
              )}
            </View>
            <Text style={styles.cellCode}>{sub ? sub.product_code : item.product_code}</Text>
            <Text style={styles.cellNum}>{qtyText(item)}</Text>
            <Text style={styles.cellNote}>
              {[sub ? `เหตุผลทดแทน: ${sub.reason}` : null, item.hq_note, item.staff_note ? `สาขา: ${item.staff_note}` : null].filter(Boolean).join(' / ') || '-'}
            </Text>
          </View>
        );
      })}
      <Text style={{ marginTop: 6, textAlign: 'right', fontWeight: 'bold' }}>รวม {items.length} รายการ</Text>

      <View style={styles.signRow} wrap={false}>
        {['ผู้จัดสินค้า', 'ผู้ตรวจสอบ'].map((role) => (
          <View key={role} style={styles.signBox}>
            <Text>ลงชื่อ ........................................</Text>
            <Text>( ........................................ )</Text>
            <Text style={{ fontWeight: 'bold' }}>{role}</Text>
            <Text style={styles.muted}>วันที่ ......../......../........</Text>
          </View>
        ))}
      </View>
      <Text style={[styles.muted, { position: 'absolute', bottom: 14, right: 28 }]} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} fixed />
    </Page>
  );
}

export async function openPickingSheetPdf(bill: BillDetail, target: Window | null) {
  const blob = await pdf(
    <Document title={`ใบจัดสินค้า ${bill.bill_no}`}>
      <PickingSheetPage bill={bill} />
    </Document>,
  ).toBlob();
  openPdfBlob(blob, `ใบจัดสินค้า-${bill.bill_no}.pdf`, target);
}


/** บิลเป็น PDF เปิดในแท็บใหม่ (ฝั่งสาขาใช้เป็นหลักฐาน) — ถ้าเปิดแท็บไม่ได้จะดาวน์โหลดแทน */
export async function openBillPdf(bill: BillDetail, target: Window | null) {
  const blob = await pdf(
    <Document title={`บิล ${bill.bill_no}`}>
      <BillPages bill={bill} />
    </Document>,
  ).toBlob();
  openPdfBlob(blob, `บิล-${bill.bill_no}.pdf`, target);
}
