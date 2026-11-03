'use client';
/* eslint-disable jsx-a11y/alt-text -- react-pdf <Image> has no alt prop */

import { Document, Font, Image, Page, StyleSheet, Text, View, pdf } from '@react-pdf/renderer';
import { openPdfBlob } from '@/lib/open-pdf';

// ใบเบิกสินค้า (ระบบเบิกเดิม) เป็นเอกสาร PDF — แทนการเปิดหน้าเว็บแล้วสั่งพิมพ์

Font.register({
  family: 'THSarabunNew',
  fonts: [
    { src: '/fonts/THSarabunNew.ttf' },
    { src: '/fonts/THSarabunNew-Bold.ttf', fontWeight: 'bold' },
  ],
});
const thaiSegmenter = typeof Intl !== 'undefined' && 'Segmenter' in Intl ? new Intl.Segmenter('th', { granularity: 'word' }) : null;
Font.registerHyphenationCallback((word) => {
  if (!thaiSegmenter || !/[฀-๿]/.test(word)) return [word];
  return Array.from(thaiSegmenter.segment(word), (part) => part.segment).flatMap((part) => [part, '']);
});

export interface RequisitionPdfData {
  branch_name: string;
  requester_name: string;
  created_at: string;
  approved_at: string | null;
}

export interface RequisitionPdfLine {
  quantity: number;
  price_at_time: number;
  rejection_reason: string | null;
  items: { name: string; unit: string } | null;
}

const PINK = '#db2777';
const styles = StyleSheet.create({
  page: { padding: 32, fontFamily: 'THSarabunNew', fontSize: 13, color: '#1e293b' },
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  logo: { width: 40, height: 40, borderRadius: 6, marginRight: 10 },
  title: { fontSize: 22, fontWeight: 'bold' },
  sub: { textAlign: 'center', color: PINK, fontSize: 12, marginBottom: 14 },
  meta: { flexDirection: 'row', flexWrap: 'wrap', border: '1px solid #fbcfe8', borderRadius: 8, backgroundColor: '#fff7fa', marginBottom: 14 },
  metaItem: { width: '50%', paddingVertical: 6, paddingHorizontal: 10 },
  metaLabel: { color: PINK, fontWeight: 'bold', fontSize: 11 },
  metaValue: { fontWeight: 'bold', color: '#334155' },
  th: { flexDirection: 'row', backgroundColor: '#fce7f3', borderTop: '1px solid #f9a8d4', borderBottom: '1px solid #f9a8d4', paddingVertical: 4, color: '#be185d', fontWeight: 'bold' },
  row: { flexDirection: 'row', borderBottom: '0.5px solid #f9a8d4', paddingVertical: 4 },
  cNo: { width: 34, textAlign: 'center' },
  cName: { flex: 1, paddingRight: 4 },
  cQty: { width: 50, textAlign: 'center' },
  cUnit: { width: 60, textAlign: 'center' },
  cPrice: { width: 80, textAlign: 'right', paddingRight: 6 },
  cNote: { width: 120, paddingLeft: 4 },
  total: { flexDirection: 'row', backgroundColor: PINK, color: '#fff', fontWeight: 'bold', paddingVertical: 5 },
  signRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 46 },
  signBox: { width: '30%', textAlign: 'center' },
  signLine: { borderTop: '1px dashed #94a3b8', marginBottom: 4, marginTop: 30 },
});

const money = (value: number) => value.toLocaleString('th-TH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const thaiDateTime = (value: string) =>
  new Intl.DateTimeFormat('th-TH', { timeZone: 'Asia/Bangkok', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value)) + ' น.';

function RequisitionDocument({ req, lines }: { req: RequisitionPdfData; lines: RequisitionPdfLine[] }) {
  const total = lines.filter((line) => !line.rejection_reason).reduce((sum, line) => sum + (line.price_at_time || 0) * (line.quantity || 0), 0);
  return (
    <Document title={`ใบเบิกสินค้า - ${req.branch_name}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.header}>
          <Image src="/logo.png" style={styles.logo} />
          <Text style={styles.title}>ใบเบิกสินค้า Aemori</Text>
        </View>
        <Text style={styles.sub}>Supply Requisition Form</Text>

        <View style={styles.meta}>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>สาขา</Text>
            <Text style={styles.metaValue}>{req.branch_name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>ผู้เบิก</Text>
            <Text style={styles.metaValue}>{req.requester_name}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>วันที่ขอเบิก</Text>
            <Text style={styles.metaValue}>{thaiDateTime(req.created_at)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>วันที่อนุมัติ</Text>
            <Text style={styles.metaValue}>{req.approved_at ? thaiDateTime(req.approved_at) : '-'}</Text>
          </View>
        </View>

        <View style={styles.th} fixed>
          <Text style={styles.cNo}>ลำดับ</Text>
          <Text style={styles.cName}>รายการสินค้า</Text>
          <Text style={styles.cQty}>จำนวน</Text>
          <Text style={styles.cUnit}>หน่วย</Text>
          <Text style={styles.cPrice}>ราคา/หน่วย (฿)</Text>
          <Text style={styles.cNote}>หมายเหตุ</Text>
        </View>
        {lines.map((line, index) => {
          const rejected = Boolean(line.rejection_reason);
          return (
            <View key={index} style={[styles.row, rejected ? { backgroundColor: '#fff5f5', color: '#94a3b8' } : {}]} wrap={false}>
              <Text style={styles.cNo}>{index + 1}</Text>
              <Text style={[styles.cName, rejected ? { textDecoration: 'line-through' } : {}]}>{line.items?.name ?? '-'}</Text>
              <Text style={[styles.cQty, rejected ? { color: '#e11d48', fontWeight: 'bold' } : {}]}>{rejected ? 'ยกเลิก' : line.quantity}</Text>
              <Text style={styles.cUnit}>{line.items?.unit ?? '-'}</Text>
              <Text style={styles.cPrice}>{rejected ? '—' : money(line.price_at_time || 0)}</Text>
              <Text style={[styles.cNote, { color: '#e11d48', fontSize: 11 }]}>{rejected ? line.rejection_reason : ''}</Text>
            </View>
          );
        })}
        <View style={styles.total} wrap={false}>
          <Text style={{ flex: 1, textAlign: 'right', paddingRight: 8 }}>รวมทั้งสิ้น</Text>
          <Text style={[styles.cPrice, { width: 120 }]}>{money(total)} ฿</Text>
          <Text style={{ width: 120 }} />
        </View>

        <View style={styles.signRow} wrap={false}>
          {[`ผู้เบิก\n(${req.requester_name})`, 'ผู้จัดของ / ตรวจสอบ', 'ผู้อนุมัติ'].map((role) => (
            <View key={role} style={styles.signBox}>
              <View style={styles.signLine} />
              <Text>{role}</Text>
            </View>
          ))}
        </View>
        <Text style={{ position: 'absolute', bottom: 14, right: 32, color: '#94a3b8', fontSize: 11 }} render={({ pageNumber, totalPages }) => `หน้า ${pageNumber}/${totalPages}`} fixed />
      </Page>
    </Document>
  );
}

export async function openRequisitionPdf(req: RequisitionPdfData, lines: RequisitionPdfLine[], target: Window | null) {
  const blob = await pdf(<RequisitionDocument req={req} lines={lines} />).toBlob();
  openPdfBlob(blob, `ใบเบิก-${req.branch_name}.pdf`, target);
}
